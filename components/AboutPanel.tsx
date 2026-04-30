export function AboutPanel() {
  return (
    <div className="px-4 py-4 text-[12.5px] leading-relaxed text-text-secondary space-y-4">
      <p>
        Live orderbook widget reading Hyperliquid&rsquo;s public WebSocket
        feed for BTC and ETH perpetuals.
      </p>

      <section>
        <h3 className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
          Animation
        </h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            In a production trading platform, depth-bar animation might be
            distracting and I&rsquo;d probably turn it off. For a widget demo
            I decided to leave it on. Can be turned off easily.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
          Features
        </h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Last trade strip at the bottom of the book.</li>
          <li>
            Row flashing on trade events. When a market order sweeps several
            price levels, every level it consumed lights up &mdash; at a
            glance you see how much depth a single execution ate through.
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
          Potential features
        </h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            nSigFigs values are hardcoded; ideally fetched from the API per
            symbol so the precision options match what Hyperliquid actually
            supports for that market.
          </li>
          <li>
            Hover a row range to show the average price and total
            cumulative size of the selection.
          </li>
        </ul>
      </section>

      <p className="text-text-muted text-[11.5px]">
        Built with Next.js 15, React 19, and Tailwind CSS.
      </p>
    </div>
  );
}
