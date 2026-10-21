import { notFound } from "next/navigation";
import { Banner, Label } from "@/components/ui";

// Placeholder structure only. These need to be written with a lawyer for the jurisdictions you sell in (see /replica-launch).
const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: {
    title: "Terms of use",
    sections: [
      ["Who we are", "The legal name, address and registration number of the company operating the service go here."],
      ["What the service is", "Statistical forecasts and technical signals for general information. Not investment advice, not a recommendation, not tailored to anyone."],
      ["Your account", "You keep your password safe and you're responsible for activity on your account. One person per account."],
      ["Plans, billing and cancellation", "What each plan includes, how billing and renewals work, how to cancel, and the refund policy."],
      ["Acceptable use", "No automated scraping or bulk export, no reselling access, no getting around plan limits."],
      ["Liability", "Limits of liability, including for trading losses, to the extent the law allows."],
      ["Governing law", "The law and courts that apply."],
    ],
  },
  privacy: {
    title: "Privacy policy",
    sections: [
      ["What we collect", "Name, email, a password hash, sessions (with the browser's user agent), watchlist, alerts, settings, and job logs. IP addresses are used for rate limiting and stored only as part of short-lived counters."],
      ["Why", "To run your account, send the alerts you ask for, bill you, and keep the service secure."],
      ["Who processes it", "Hosting: Vercel. Database: the Postgres provider set in DATABASE_URL (Supabase or Neon). Email: Resend, which receives your address and the message. No payment processor: this build takes no payments. Market-data providers (Binance, the ECB via Frankfurter, CoinPaprika and, if configured, Alpaca) receive no personal data. We don't sell personal data."],
      ["How long we keep it", "While your account is open. Deleting your account removes it straight away, except records we must keep by law."],
      ["Your rights", "Access, correction, export and deletion, and how to contact us or your data protection authority."],
    ],
  },
  risk: {
    title: "Risk disclosure",
    sections: [
      ["Forecasts can be wrong", "Every number on this site comes from past behaviour. Markets change, and a range that held before can break."],
      ["Leverage and volatile assets", "Crypto and leveraged products can lose most or all of their value quickly."],
      ["Not advice", "Nothing here considers your finances, goals or tolerance for risk. Speak to a regulated adviser before making decisions."],
      ["Track record", "Past accuracy, including ours, does not guarantee future accuracy."],
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  return { title: DOCS[(await params).doc]?.title ?? "Legal" };
}

export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const d = DOCS[(await params).doc];
  if (!d) notFound();
  return (
    <article className="mx-auto max-w-prose space-y-6">
      <div className="space-y-2"><Label>Legal</Label><h1 className="text-xl">{d.title}</h1></div>
      <Banner tone="warning">Draft outline. This page needs its final wording, reviewed by a lawyer, before launch.</Banner>
      {d.sections.map(([h, t]) => (
        <section key={h} className="space-y-1"><h2 className="text-lg">{h}</h2><p className="text-muted">{t}</p></section>
      ))}
    </article>
  );
}
