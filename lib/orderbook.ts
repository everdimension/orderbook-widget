import { throttle } from "./throttle";

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const COMMIT_INTERVAL_MS = 100;
const ROWS_PER_SIDE = 14;
const RECONNECT_INITIAL_MS = 500;
const RECONNECT_MAX_MS = 8000;

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
};

export type Snapshot = {
  bids: Row[];
  asks: Row[];
  maxTotal: number;
  spread: number | null;
  spreadPct: number | null;
  midPrice: number | null;
  lastUpdate: number;
};

export const EMPTY_SNAPSHOT: Snapshot = {
  bids: [],
  asks: [],
  maxTotal: 0,
  spread: null,
  spreadPct: null,
  midPrice: null,
  lastUpdate: 0,
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

    snapshot = {
      bids,
      asks,
      maxTotal,
      spread,
      spreadPct,
      midPrice,
      lastUpdate: latest.time,
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
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as
          | L2BookMessage
          | { channel: string };
        if (msg.channel !== "l2Book") return;
        const data = (msg as L2BookMessage).data;
        if (!data || data.coin !== coin) return;
        latest = {
          bids: data.levels[0] ?? [],
          asks: data.levels[1] ?? [],
          time: data.time,
        };
        scheduleCommit();
      } catch {
        // ignore malformed
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
          } catch {
            // ignore
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
    rows.push({ px, pxStr: lvl.px, sz, total: cumulative });
  }
  return rows;
}
