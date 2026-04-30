"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ConnStatus,
  L2BookMessage,
  NSigFigs,
  RawLevel,
  Row,
  Snapshot,
  Symbol,
} from "@/lib/types";
import { throttle } from "@/lib/throttle";

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const RENDER_INTERVAL_MS = 100;
const ROWS_PER_SIDE = 14;

const EMPTY_SNAPSHOT: Snapshot = {
  bids: [],
  asks: [],
  maxTotal: 0,
  spread: null,
  spreadPct: null,
  midPrice: null,
  lastUpdate: 0,
};

/**
 * Subscribe to Hyperliquid l2Book and return a throttled snapshot.
 *
 * Performance: WS messages mutate a ref (no re-render) and trigger a
 * leading+trailing throttled commit, so React re-renders at most once per
 * RENDER_INTERVAL_MS regardless of message rate, with no idle timer.
 */
export function useOrderbook({
  symbol,
  nSigFigs,
}: {
  symbol: Symbol;
  nSigFigs: NSigFigs;
}): {
  snapshot: Snapshot;
  status: ConnStatus;
} {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [status, setStatus] = useState<ConnStatus>("idle");

  const latestRef = useRef<{
    bids: RawLevel[];
    asks: RawLevel[];
    time: number;
  } | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 500;
    let cancelled = false;

    latestRef.current = null;
    setSnapshot(EMPTY_SNAPSHOT);

    const subscribeMessage = JSON.stringify({
      method: "subscribe",
      subscription: { type: "l2Book", coin: symbol, nSigFigs },
    });

    const commit = () => {
      if (!latestRef.current) return;
      const { bids: rawBids, asks: rawAsks, time } = latestRef.current;
      const bids = buildSide(rawBids);
      const asks = buildSide(rawAsks);

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

      setSnapshot({
        bids,
        asks,
        maxTotal,
        spread,
        spreadPct,
        midPrice,
        lastUpdate: time,
      });
    };

    const scheduleCommit = throttle(commit, RENDER_INTERVAL_MS);

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        if (cancelled) return;
        setStatus("open");
        backoff = 500;
        ws?.send(subscribeMessage);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as
            | L2BookMessage
            | { channel: string };
          if (msg.channel !== "l2Book") return;
          const data = (msg as L2BookMessage).data;
          if (!data || data.coin !== symbol) return;
          latestRef.current = {
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
        if (cancelled) return;
        setStatus("closed");
        reconnectTimer = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 8000);
      };
    };

    connect();

    return () => {
      cancelled = true;
      scheduleCommit.cancel();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(
              JSON.stringify({
                method: "unsubscribe",
                subscription: { type: "l2Book", coin: symbol, nSigFigs },
              }),
            );
          } catch {
            // ignore
          }
        }
        ws.close();
      }
    };
  }, [symbol, nSigFigs]);

  return { snapshot, status };
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
