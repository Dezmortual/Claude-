import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t bg-surface-sunken">
      <div className="mx-auto grid max-w-content gap-6 px-4 py-8 text-sm text-muted lg:px-6">
        <p className="max-w-prose">
          Forecasts and signals are statistical estimates for research and education. They are not financial advice and do not
          account for your circumstances. Prices can move against any forecast; never risk money you cannot afford to lose.
        </p>
        <p className="max-w-prose">
          Crypto prices come from Binance, forex from Twelve Data (or the European Central Bank&apos;s daily rates without its
          key), bond yields from the US Treasury, the Bundesbank and the Bank of England, and stocks and funds from Alpaca
          once its keys are set. Assets marked Demo run on generated data, not real prices. Each asset page names its source.
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/status" className="hover:text-fg">Data status</Link>
          <Link href="/legal/terms" className="hover:text-fg">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-fg">Privacy</Link>
          <Link href="/legal/risk" className="hover:text-fg">Risk disclosure</Link>
          <Link href="/track-record" className="hover:text-fg">Track record</Link>
          <Link href="/design" className="hover:text-fg">Design system</Link>
        </nav>
      </div>
    </footer>
  );
}
