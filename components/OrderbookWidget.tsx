"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  createOrderbookSubscription,
  EMPTY_SNAPSHOT,
  type Coin,
  type ConnStatus,
  type NSigFigs,
  type Snapshot,
  type Trade,
} from "@/lib/orderbook";
import {
  formatPrice,
  formatSize,
  formatSpreadAbs,
  formatSpreadPct,
  formatTotal,
} from "@/lib/format";
import { AboutPanel } from "./AboutPanel";

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

type Tab = "orderbook" | "about";

export function OrderbookWidget() {
  const [tab, setTab] = useState<Tab>("orderbook");
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
      <TabBar tab={tab} onTab={setTab} />

      {tab === "orderbook" ? (
        <>
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
                    flashAt={row.flashAt}
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
                    flashAt={row.flashAt}
                  />
                ))
              )}
            </div>
          </div>

          <LastTradeFooter lastTrades={snapshot.lastTrades} coin={coin} />
        </>
      ) : (
        <AboutPanel />
      )}
    </div>
  );
}

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <div className="flex border-b border-bg-border bg-bg-panel">
      <TabButton active={tab === "orderbook"} onClick={() => onTab("orderbook")}>
        Order book
      </TabButton>
      <TabButton active={tab === "about"} onClick={() => onTab("about")}>
        About
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 text-[11px] uppercase tracking-wide transition-colors border-b-2 ${
        active
          ? "text-text-primary border-text-primary"
          : "text-text-muted border-transparent hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function LastTradeFooter({
  lastTrades,
  coin,
}: {
  lastTrades: Trade[];
  coin: Coin;
}) {
  // lastTrades is a per-commit window (often empty), so we sticky-cache the
  // most recent trade here for the footer.
  const [trade, setTrade] = useState<Trade | null>(null);
  useEffect(() => {
    setTrade(null);
  }, [coin]);
  useEffect(() => {
    if (lastTrades.length > 0) setTrade(lastTrades[lastTrades.length - 1]);
  }, [lastTrades]);

  // Re-render at 1Hz so the "Xs ago" label advances. Lightweight when mounted.
  const [, force] = useState(0);
  useEffect(() => {
    if (!trade) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [trade]);

  return (
    <div className="px-3 py-1.5 border-t border-bg-border bg-bg-panel text-[11px] text-text-muted flex items-center gap-2">
      <span className="uppercase tracking-wide">Last trade</span>
      {trade ? (
        <>
          <span
            className={`tabular-nums ${trade.side === "B" ? "text-bid" : "text-ask"}`}
          >
            {trade.side === "B" ? "↑ buy" : "↓ sell"}
          </span>
          <span className="tabular-nums text-text-primary">
            {formatPrice(trade.pxStr)}
          </span>
          <span className="tabular-nums">
            {trade.sz} {coin}
          </span>
          <span className="ml-auto tabular-nums">
            {Math.max(0, Math.round((Date.now() - trade.time) / 1000))}s ago
          </span>
        </>
      ) : (
        <span>—</span>
      )}
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
          className="bg-bg-row border border-bg-border text-text-primary text-sm rounded pl-2 pr-6 py-1 font-medium focus:outline-none focus:border-text-secondary"
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
          className="bg-bg-row border border-bg-border text-text-secondary text-xs rounded pl-2 pr-6 py-1 focus:outline-none focus:border-text-secondary"
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

const FLASH_DURATION_MS = 450;
const FLASH_KEYFRAMES_BID: Keyframe[] = [
  { backgroundColor: "rgba(38, 166, 154, 0.45)" },
  { backgroundColor: "rgba(38, 166, 154, 0)" },
];
const FLASH_KEYFRAMES_ASK: Keyframe[] = [
  { backgroundColor: "rgba(239, 83, 80, 0.45)" },
  { backgroundColor: "rgba(239, 83, 80, 0)" },
];

const OrderbookRow = memo(function OrderbookRow({
  pxStr,
  sz,
  total,
  depthPct,
  side,
  flashAt,
}: {
  pxStr: string;
  sz: number;
  total: number;
  depthPct: number;
  side: Side;
  flashAt: number;
}) {
  const isBid = side === "bid";
  const rowRef = useRef<HTMLDivElement>(null);
  const lastFlashRef = useRef(0);
  const animRef = useRef<Animation | null>(null);

  useEffect(() => {
    if (flashAt === 0) return; // unstamped — never flash
    if (flashAt === lastFlashRef.current) return; // already played this stamp
    lastFlashRef.current = flashAt;
    const el = rowRef.current;
    if (!el) return;
    animRef.current?.cancel();
    animRef.current = el.animate(
      isBid ? FLASH_KEYFRAMES_BID : FLASH_KEYFRAMES_ASK,
      { duration: FLASH_DURATION_MS, easing: "ease-out", fill: "none" },
    );
  }, [flashAt, isBid]);

  return (
    <div
      ref={rowRef}
      className="relative grid grid-cols-3 gap-2 px-3 py-[3px] text-[12.5px] leading-tight"
    >
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
      {Array.from({ length: 12 }).map((_, i) => (
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
