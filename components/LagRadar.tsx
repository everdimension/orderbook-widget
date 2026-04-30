"use client";

import Radar from "react-lag-radar";

export function LagRadar() {
  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-md border border-bg-border bg-bg-panel/90 backdrop-blur p-2 shadow-2xl pointer-events-none">
      <div className="text-[10px] uppercase tracking-wide text-text-muted text-center mb-1">
        Lag radar
      </div>
      <Radar frames={50} speed={0.0017} size={120} inset={3} />
    </div>
  );
}
