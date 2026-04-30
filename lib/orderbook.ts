import { throttle } from "./throttle";

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const COMMIT_INTERVAL_MS = 100;
const ROWS_PER_SIDE = 12;
const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 8000;
/**
 * Minimum gap between consecutive flashes on the same price bucket. Caps
 * strobing on a hot price level — a single user action that consumes 10
 * makers in 50ms still produces one visible flash.
 */
const FLASH_DEBOUNCE_MS = 500;

export type Coin = "BTC" | "ETH";
export type NSigFigs = 2 | 3 | 4 | 5;
export type ConnStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export type Row = {
  px: number;
  pxStr: string;
  sz: number;
  total: number;
  /** ms timestamp of the last trade that hit this bucket; 0 if none. */
  flashAt: number;
};

export type Trade = {
  pxStr: string;
  px: number;
  sz: number;
  /** "A" = aggressor sold (a bid was hit); "B" = aggressor bought (an ask was lifted). */
  side: "A" | "B";
  time: number;
};

export type Snapshot = {
  bids: Row[];
  asks: Row[];
  maxTotal: number;
  spread: number | null;
  spreadPct: number | null;
  midPrice: number | null;
  lastUpdate: number;
  /** Trades that arrived since the previous commit. Empty most ticks. */
  lastTrades: Trade[];
};

export const EMPTY_SNAPSHOT: Snapshot = {
  bids: [],
  asks: [],
  maxTotal: 0,
  spread: null,
  spreadPct: null,
  midPrice: null,
  lastUpdate: 0,
  lastTrades: [],
};

type RawLevel = { px: string; sz: string; n: number };
type L2BookMessage = {
  channel: "l2Book";
  data: {
    coin: string;
    time: number;
    levels: [RawLevel[], RawLevel[]]; // [bids, asks]
  };
};

type RawTrade = {
  coin: string;
  side: "A" | "B";
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid: number;
};
type TradesMessage = { channel: "trades"; data: RawTrade[] };

type Listener = () => void;

export type OrderbookSubscription = {
  subscribe(listener: Listener): () => void;
  getSnapshot(): Snapshot;
  getStatus(): ConnStatus;
  close(): void;
};

/**
 * Open a Hyperliquid l2Book subscription. Returns a small observable store
 * that listeners can subscribe to; React (or anything else) can read the
 * latest snapshot/status synchronously and re-render on change.
 *
 * WS messages mutate an internal ref and trigger a leading+trailing
 * throttled commit, so consumers see at most one update per
 * COMMIT_INTERVAL_MS regardless of message rate.
 */
export function createOrderbookSubscription(params: {
  coin: Coin;
  nSigFigs: NSigFigs;
}): OrderbookSubscription {
  const { coin, nSigFigs } = params;

  let snapshot: Snapshot = EMPTY_SNAPSHOT;
  let status: ConnStatus = "idle";
  const listeners = new Set<Listener>();

  let latest: { bids: RawLevel[]; asks: RawLevel[]; time: number } | null = null;
  /** Trades that arrived since the last commit. Drained on every commit. */
  let pendingTrades: Trade[] = [];
  /**
   * Per-bucket last-flash timestamp (perf.now ms). Persists across commits;
   * powers the debounce so a single market-order burst doesn't strobe.
   */
  const lastFlashedAt = new Map<string, number>();
  /**
   * Wallclock time when we sent the trades subscribe. We drop any trade
   * whose `time` is older than this so the connect-time backfill doesn't
   * flash dozens of historical trades at once.
   */
  let tradesSubscribedAt = 0;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = RECONNECT_INITIAL_MS;
  let closed = false;

  const notify = () => {
    listeners.forEach((l) => l());
  };

  const setStatus = (next: ConnStatus) => {
    if (status === next) return;
    status = next;
    notify();
  };

  const commit = () => {
    if (!latest) return;
    const bids = buildSide(latest.bids);
    const asks = buildSide(latest.asks);

    const bestBid = bids[0]?.px ?? null;
    const bestAsk = asks[0]?.px ?? null;
    const spread =
      bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
    const midPrice =
      bestBid != null && bestAsk != null ? (bestAsk + bestBid) / 2 : null;
    const spreadPct =
      spread != null && midPrice ? (spread / midPrice) * 100 : null;
    const maxTotal = Math.max(
      bids[bids.length - 1]?.total ?? 0,
      asks[asks.length - 1]?.total ?? 0,
      1e-12,
    );

    const lastTrades = pendingTrades;
    pendingTrades = [];

    // Match each trade to the row whose bucket contains it, then stamp
    // flashAt with debounce. Side "A" = aggressor sold → bid was hit; "B" =
    // aggressor bought → ask was lifted.
    const now = performance.now();
    for (const t of lastTrades) {
      const side = t.side === "A" ? bids : asks;
      const match = nearestRow(side, t.px);
      if (!match) continue;
      const prev = lastFlashedAt.get(match.pxStr) ?? 0;
      if (now - prev < FLASH_DEBOUNCE_MS) continue;
      lastFlashedAt.set(match.pxStr, now);
    }
    for (const r of bids) r.flashAt = lastFlashedAt.get(r.pxStr) ?? 0;
    for (const r of asks) r.flashAt = lastFlashedAt.get(r.pxStr) ?? 0;

    snapshot = {
      bids,
      asks,
      maxTotal,
      spread,
      spreadPct,
      midPrice,
      lastUpdate: latest.time,
      lastTrades,
    };
    notify();
  };

  const scheduleCommit = throttle(commit, COMMIT_INTERVAL_MS);

  const connect = () => {
    if (closed) return;
    setStatus("connecting");
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (closed) return;
      setStatus("open");
      backoff = RECONNECT_INITIAL_MS;
      ws?.send(
        JSON.stringify({
          method: "subscribe",
          subscription: { type: "l2Book", coin, nSigFigs },
        }),
      );
      tradesSubscribedAt = Date.now();
      ws?.send(
        JSON.stringify({
          method: "subscribe",
          subscription: { type: "trades", coin },
        }),
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as
          | L2BookMessage
          | TradesMessage
          | { channel: string };

        if (msg.channel === "l2Book") {
          const data = (msg as L2BookMessage).data;
          if (!data || data.coin !== coin) return;
          latest = {
            bids: data.levels[0] ?? [],
            asks: data.levels[1] ?? [],
            time: data.time,
          };
          scheduleCommit();
        } else if (msg.channel === "trades") {
          const trades = (msg as TradesMessage).data;
          if (!Array.isArray(trades)) return;
          for (const t of trades) {
            if (t.coin !== coin) continue;
            // Drop the connect-time backfill: keep only trades that
            // happened after we subscribed.
            if (t.time < tradesSubscribedAt) continue;
            pendingTrades.push({
              pxStr: t.px,
              px: parseFloat(t.px),
              sz: parseFloat(t.sz),
              side: t.side,
              time: t.time,
            });
          }
          if (pendingTrades.length > 0) scheduleCommit();
        }
      } catch (err) {
        console.warn("orderbook: failed to parse WS message", err);
      }
    };

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onclose = () => {
      if (closed) return;
      setStatus("closed");
      reconnectTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    };
  };

  connect();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getStatus: () => status,
    close() {
      closed = true;
      scheduleCommit.cancel();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(
              JSON.stringify({
                method: "unsubscribe",
                subscription: { type: "l2Book", coin, nSigFigs },
              }),
            );
            ws.send(
              JSON.stringify({
                method: "unsubscribe",
                subscription: { type: "trades", coin },
              }),
            );
          } catch (err) {
            console.warn("orderbook: failed to send unsubscribe on close", err);
          }
        }
        ws.close();
      }
      listeners.clear();
    },
  };
}

function buildSide(raw: RawLevel[]): Row[] {
  const rows: Row[] = [];
  let cumulative = 0;
  const limit = Math.min(raw.length, ROWS_PER_SIDE);
  for (let i = 0; i < limit; i++) {
    const lvl = raw[i];
    const sz = parseFloat(lvl.sz);
    const px = parseFloat(lvl.px);
    cumulative += sz;
    rows.push({ px, pxStr: lvl.px, sz, total: cumulative, flashAt: 0 });
  }
  return rows;
}

/**
 * Find the row whose price is closest to `targetPx`, returning it only if
 * within half the inter-row spacing (so trades that landed outside the
 * visible window don't flash an edge row). Returns null on empty side.
 */
function nearestRow(side: Row[], targetPx: number): Row | null {
  if (side.length === 0) return null;
  let best: Row | null = null;
  let bestDiff = Infinity;
  for (const r of side) {
    const d = Math.abs(r.px - targetPx);
    if (d < bestDiff) {
      bestDiff = d;
      best = r;
    }
  }
  if (!best) return null;
  const spacing =
    side.length > 1 ? Math.abs(side[0].px - side[1].px) : Infinity;
  const tolerance = spacing / 2 + 1e-9;
  return bestDiff <= tolerance ? best : null;
}
