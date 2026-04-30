"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  createOrderbookSubscription,
  EMPTY_SNAPSHOT,
  type Coin,
  type ConnStatus,
  type NSigFigs,
  type Snapshot,
} from "@/lib/orderbook";
import {
  formatPrice,
  formatSize,
  formatSpreadAbs,
  formatSpreadPct,
  formatTotal,
} from "@/lib/format";

const COINS: Coin[] = ["BTC", "ETH"];
const SIG_FIGS: NSigFigs[] = [2, 3, 4, 5];

/**
 * Thin React adapter over the orderbook subscription store. Creates a
 * subscription per (coin, nSigFigs), tears it down on change/unmount.
 *
 * useSyncExternalStore was considered but rejected: with dynamic params it
 * requires useMemo for the store + a separate cleanup effect, which is racy
 * under strict mode. This useEffect bridge is strict-mode safe by construction.
 */
function useOrderbook(
  coin: Coin,
  nSigFigs: NSigFigs,
): { snapshot: Snapshot; status: ConnStatus } {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [status, setStatus] = useState<ConnStatus>("idle");

  useEffect(() => {
    const sub = createOrderbookSubscription({ coin, nSigFigs });
    setSnapshot(sub.getSnapshot());
    setStatus(sub.getStatus());
    const unsubscribe = sub.subscribe(() => {
      setSnapshot(sub.getSnapshot());
      setStatus(sub.getStatus());
    });
    return () => {
      unsubscribe();
      sub.close();
    };
  }, [coin, nSigFigs]);

  return { snapshot, status };
}

/**
 * Hyperliquid's nSigFigs rounds prices to N significant figures, producing a
 * tick of 10^(integerDigits − N) at the reference price.
 *
 * BTC ~$75k, nSigFigs=5 → 10^(5−5) = $1.
 * ETH ~$3.5k, nSigFigs=5 → 10^(4−5) = $0.10.
 */
function tickSizeForNSigFigs(refPrice: number, nSigFigs: number): number {
  if (!Number.isFinite(refPrice) || refPrice <= 0) return 0;
  const integerDigits = Math.floor(Math.log10(refPrice)) + 1;
  return Math.pow(10, integerDigits - nSigFigs);
}

function formatTickSize(tick: number): string {
  if (!Number.isFinite(tick) || tick <= 0) return "";
  if (tick >= 1) {
    return `$${tick.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(tick)));
  return `$${tick.toFixed(decimals)}`;
}

export function OrderbookWidget() {
  const [coin, setCoin] = useState<Coin>("BTC");
  const [nSigFigs, setNSigFigs] = useState<NSigFigs>(5);

  const { snapshot, status } = useOrderbook(coin, nSigFigs);

  // Asks come ascending from the API; display best ask at the bottom (closest
  // to the spread row) by reversing.
  const asksDesc = useMemo(
    () => snapshot.asks.slice().reverse(),
    [snapshot.asks],
  );

  const isLive = status === "open" && snapshot.lastUpdate > 0;

  return (
    <div className="w-[420px] max-w-full bg-bg-panel border border-bg-border rounded-md shadow-2xl overflow-hidden">
      <Header
        coin={coin}
        nSigFigs={nSigFigs}
        onCoin={setCoin}
        onNSigFigs={setNSigFigs}
        isLive={isLive}
        status={status}
        refPrice={snapshot.midPrice}
      />

      <ColumnHeader />

      <div className="flex flex-col">
        <div className="flex flex-col">
          {asksDesc.length === 0 ? (
            <Skeleton />
          ) : (
            asksDesc.map((row) => (
              <OrderbookRow
                key={row.pxStr}
                pxStr={row.pxStr}
                sz={row.sz}
                total={row.total}
                depthPct={(row.total / snapshot.maxTotal) * 100}
                side="ask"
              />
            ))
          )}
        </div>

        <SpreadRow
          spread={snapshot.spread}
          spreadPct={snapshot.spreadPct}
          status={status}
        />

        <div className="flex flex-col">
          {snapshot.bids.length === 0 ? (
            <Skeleton />
          ) : (
            snapshot.bids.map((row) => (
              <OrderbookRow
                key={row.pxStr}
                pxStr={row.pxStr}
                sz={row.sz}
                total={row.total}
                depthPct={(row.total / snapshot.maxTotal) * 100}
                side="bid"
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Header({
  coin,
  nSigFigs,
  onCoin,
  onNSigFigs,
  isLive,
  status,
  refPrice,
}: {
  coin: Coin;
  nSigFigs: NSigFigs;
  onCoin: (c: Coin) => void;
  onNSigFigs: (n: NSigFigs) => void;
  isLive: boolean;
  status: ConnStatus;
  refPrice: number | null;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-bg-border bg-bg-panel">
      <div className="flex items-center gap-2">
        <select
          aria-label="Coin"
          value={coin}
          onChange={(e) => onCoin(e.target.value as Coin)}
          className="bg-bg-row border border-bg-border text-text-primary text-sm rounded px-2 py-1 font-medium focus:outline-none focus:border-text-secondary"
        >
          {COINS.map((c) => (
            <option key={c} value={c}>
              {c}-USD
            </option>
          ))}
        </select>
        <select
          aria-label="Price precision (significant figures)"
          value={nSigFigs}
          onChange={(e) => onNSigFigs(Number(e.target.value) as NSigFigs)}
          className="bg-bg-row border border-bg-border text-text-secondary text-xs rounded px-2 py-1 focus:outline-none focus:border-text-secondary"
        >
          {SIG_FIGS.map((n) => {
            const tick = refPrice ? tickSizeForNSigFigs(refPrice, n) : 0;
            const tickLabel = tick ? ` · ${formatTickSize(tick)}` : "";
            return (
              <option key={n} value={n}>
                {n} sig figs{tickLabel}
              </option>
            );
          })}
        </select>
      </div>

      <StatusDot isLive={isLive} status={status} />
    </div>
  );
}

function StatusDot({
  isLive,
  status,
}: {
  isLive: boolean;
  status: ConnStatus;
}) {
  const label =
    status === "open"
      ? isLive
        ? "Live"
        : "Subscribed"
      : status === "connecting"
        ? "Connecting"
        : status === "closed"
          ? "Reconnecting"
          : status === "error"
            ? "Error"
            : "Idle";
  const dot = isLive
    ? "bg-bid"
    : status === "connecting" || status === "closed"
      ? "bg-yellow-400"
      : "bg-text-muted";
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
      <span className="relative flex h-2 w-2">
        {isLive && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-bid opacity-50 animate-ping" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <span>{label}</span>
    </div>
  );
}

function ColumnHeader() {
  return (
    <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[10.5px] uppercase tracking-wide text-text-muted border-b border-bg-border">
      <span>Price (USD)</span>
      <span className="text-right">Size</span>
      <span className="text-right">Total</span>
    </div>
  );
}

function SpreadRow({
  spread,
  spreadPct,
  status,
}: {
  spread: number | null;
  spreadPct: number | null;
  status: ConnStatus;
}) {
  // Pre-data: take over the whole row with a modest status line so the
  // loading state has somewhere to speak from. Same height as the live row
  // (px-3 py-2 text-xs), so no layout shift when data arrives.
  if (spread == null) {
    return (
      <div className="px-3 py-2 text-xs border-y border-bg-border bg-bg-row text-text-muted">
        {emptyStatusMessage(status)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2 px-3 py-2 text-xs border-y border-bg-border bg-bg-row">
      <span className="text-text-muted uppercase tracking-wide text-[10.5px] self-center">
        Spread
      </span>
      <span className="text-right tabular-nums text-text-primary">
        {formatSpreadAbs(spread)}
      </span>
      <span className="text-right tabular-nums text-text-secondary">
        {spreadPct != null ? formatSpreadPct(spreadPct) : "—"}
      </span>
    </div>
  );
}

function emptyStatusMessage(status: ConnStatus): string {
  switch (status) {
    case "error":
      return "Connection error — retrying…";
    case "closed":
      return "Reconnecting…";
    case "open":
      return "Awaiting first snapshot…";
    default:
      return "Connecting to Hyperliquid…";
  }
}

type Side = "bid" | "ask";

const OrderbookRow = memo(function OrderbookRow({
  pxStr,
  sz,
  total,
  depthPct,
  side,
}: {
  pxStr: string;
  sz: number;
  total: number;
  depthPct: number;
  side: Side;
}) {
  const isBid = side === "bid";
  return (
    <div className="relative grid grid-cols-3 gap-2 px-3 py-[3px] text-[12.5px] leading-tight">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 depth-bar ${isBid ? "bg-bid-bar" : "bg-ask-bar"}`}
        style={{ ["--depth" as string]: `${depthPct}%` }}
      />
      <span
        className={`relative tabular-nums ${isBid ? "text-bid" : "text-ask"}`}
      >
        {formatPrice(pxStr)}
      </span>
      <span className="relative tabular-nums text-text-primary text-right">
        {formatSize(sz)}
      </span>
      <span className="relative tabular-nums text-text-secondary text-right">
        {formatTotal(total)}
      </span>
    </div>
  );
});

function Skeleton() {
  // Empty rows preserve the layout (no jump when real data arrives) but
  // intentionally don't pretend to be a fake orderbook — loading is signaled
  // by the status line in the spread row and the dot in the header.
  return (
    <div className="flex flex-col">
      {Array.from({ length: 14 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-3 gap-2 px-3 py-[3px] text-[12.5px] leading-tight"
        >
          <span>&nbsp;</span>
          <span>&nbsp;</span>
          <span>&nbsp;</span>
        </div>
      ))}
    </div>
  );
}
