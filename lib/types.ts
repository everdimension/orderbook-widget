export type Symbol = "BTC" | "ETH";
export type NSigFigs = 2 | 3 | 4 | 5;

export type RawLevel = { px: string; sz: string; n: number };

export type L2BookMessage = {
  channel: "l2Book";
  data: {
    coin: string;
    time: number;
    levels: [RawLevel[], RawLevel[]]; // [bids, asks]
  };
};

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

export type ConnStatus = "idle" | "connecting" | "open" | "closed" | "error";
