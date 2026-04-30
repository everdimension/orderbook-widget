"use client";

import { memo } from "react";
import { formatPrice, formatSize, formatTotal } from "@/lib/format";

type Side = "bid" | "ask";

type Props = {
  pxStr: string;
  sz: number;
  total: number;
  depthPct: number;
  side: Side;
};

function OrderbookRowImpl({ pxStr, sz, total, depthPct, side }: Props) {
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
}

export const OrderbookRow = memo(OrderbookRowImpl);
