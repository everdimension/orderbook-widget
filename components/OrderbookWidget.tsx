"use client";

import { useMemo, useState } from "react";
import { useOrderbook } from "@/hooks/useOrderbook";
import type { NSigFigs, Symbol } from "@/lib/types";
import {
  formatSpreadAbs,
  formatSpreadPct,
  formatTickSize,
  tickSizeForNSigFigs,
} from "@/lib/format";
import { OrderbookRow } from "./OrderbookRow";

const SYMBOLS: Symbol[] = ["BTC", "ETH"];
const SIG_FIGS: NSigFigs[] = [2, 3, 4, 5];

export function OrderbookWidget() {
  const [symbol, setSymbol] = useState<Symbol>("BTC");
  const [nSigFigs, setNSigFigs] = useState<NSigFigs>(5);

  const { snapshot, status } = useOrderbook({ symbol, nSigFigs });

  // Asks come ascending from the API; display best ask at the bottom (closest
  // to the spread row) by reversing.
  const asksDesc = useMemo(() => snapshot.asks.slice().reverse(), [snapshot.asks]);

  const isLive = status === "open" && snapshot.lastUpdate > 0;

  return (
    <div className="w-[420px] max-w-full bg-bg-panel border border-bg-border rounded-md shadow-2xl overflow-hidden">
      <Header
        symbol={symbol}
        nSigFigs={nSigFigs}
        onSymbol={setSymbol}
        onNSigFigs={setNSigFigs}
        isLive={isLive}
        status={status}
        refPrice={snapshot.midPrice}
      />

      <ColumnHeader />

      <div className="flex flex-col">
        <div className="flex flex-col">
          {asksDesc.length === 0 ? (
            <Skeleton side="ask" />
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
          midPrice={snapshot.midPrice}
        />

        <div className="flex flex-col">
          {snapshot.bids.length === 0 ? (
            <Skeleton side="bid" />
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
  symbol,
  nSigFigs,
  onSymbol,
  onNSigFigs,
  isLive,
  status,
  refPrice,
}: {
  symbol: Symbol;
  nSigFigs: NSigFigs;
  onSymbol: (s: Symbol) => void;
  onNSigFigs: (n: NSigFigs) => void;
  isLive: boolean;
  status: string;
  refPrice: number | null;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-bg-border bg-bg-panel">
      <div className="flex items-center gap-2">
        <select
          aria-label="Symbol"
          value={symbol}
          onChange={(e) => onSymbol(e.target.value as Symbol)}
          className="bg-bg-row border border-bg-border text-text-primary text-sm rounded px-2 py-1 font-medium focus:outline-none focus:border-text-secondary"
        >
          {SYMBOLS.map((s) => (
            <option key={s} value={s}>
              {s}-USD
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

function StatusDot({ isLive, status }: { isLive: boolean; status: string }) {
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
      <span className={`relative flex h-2 w-2`}>
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
  midPrice,
}: {
  spread: number | null;
  spreadPct: number | null;
  midPrice: number | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 px-3 py-2 text-xs border-y border-bg-border bg-bg-row">
      <span className="text-text-muted uppercase tracking-wide text-[10.5px] self-center">
        Spread
      </span>
      <span className="text-right tabular-nums text-text-primary">
        {spread != null ? formatSpreadAbs(spread) : "—"}
      </span>
      <span className="text-right tabular-nums text-text-secondary">
        {spreadPct != null
          ? formatSpreadPct(spreadPct)
          : midPrice != null
            ? "—"
            : "—"}
      </span>
    </div>
  );
}

function Skeleton({ side }: { side: "bid" | "ask" }) {
  const isBid = side === "bid";
  const bg = isBid ? "bg-bid-bar" : "bg-ask-bar";
  return (
    <div className="flex flex-col">
      {Array.from({ length: 14 }).map((_, i) => {
        // Mimic the cumulative-depth pyramid: bars grow as you move away
        // from the spread. Asks are rendered top-to-bottom = far → near,
        // bids top-to-bottom = near → far.
        const depthPct = isBid ? ((i + 1) / 14) * 100 : ((14 - i) / 14) * 100;
        return (
          <div
            key={i}
            className="relative grid grid-cols-3 gap-2 px-3 py-[3px] text-[12.5px] leading-tight"
          >
            <span
              aria-hidden
              className={`absolute inset-y-0 left-0 depth-bar ${bg}`}
              style={{ ["--depth" as string]: `${depthPct}%` }}
            />
            <span className="relative">&nbsp;</span>
            <span className="relative">&nbsp;</span>
            <span className="relative">&nbsp;</span>
          </div>
        );
      })}
    </div>
  );
}
