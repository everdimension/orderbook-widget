"use client";

import Radar from "react-lag-radar";

export function LagRadar() {
  return (
    <div className="md:fixed md:bottom-4 md:right-4 md:z-50 rounded-md border border-bg-border bg-bg-panel/90 backdrop-blur p-2 shadow-2xl pointer-events-none">
      <div className="text-[10px] uppercase tracking-wide text-text-muted leading-tight">
        Lag radar
      </div>
      <div className="text-[9px] text-text-muted/70 leading-tight mb-1.5">
        stutters when the main thread lags
      </div>
      <div className="flex justify-center">
        <Radar frames={50} speed={0.0017} size={100} inset={3} />
      </div>
    </div>
  );
}
