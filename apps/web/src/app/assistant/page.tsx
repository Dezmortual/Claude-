import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AssistantChat } from "@/components/client/AssistantChat";
import { Card, Label, cx } from "@/components/ui";
import { DataError, assistantStatus, getConversation, listConversations } from "@/lib/data";
import { viewer } from "@/lib/session";

export const metadata = { title: "Assistant" };

export default async function Assistant({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const v = await viewer();
  if (!v.user) redirect("/sign-in?next=/assistant");
  const cid = (await searchParams).c;
  const [status, conversations] = await Promise.all([assistantStatus(v), listConversations(v)]);
  const current = cid && /^[0-9a-f-]{36}$/i.test(cid) ? await getConversation(v, cid).catch((e) => { if (e instanceof DataError) notFound(); throw e; }) : null;
  const tz = v.user.timezone;
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Label>Assistant</Label>
        <h1 className="text-xl md:text-display">{current ? current.title : "Ask the research assistant"}</h1>
        <p className="max-w-prose text-muted">
          Claude answers using FXDEZ&apos;s own data: prices, signals and forecasts, the news, your portfolio and Alpaca account, the economy and prediction markets.
          It looks things up rather than guessing, links its sources, and can&apos;t place trades. Each question costs a few cents of your Anthropic credit.
        </p>
      </div>
      {!status.configured ? (
        <Card className="space-y-2 p-5 text-sm">
          <p className="font-semibold">Not set up yet</p>
          <p className="text-muted">Create an API key at console.anthropic.com, add it in Vercel as <code>ANTHROPIC_API_KEY</code>, then redeploy.
            Optionally set <code>AI_DAILY_LIMIT_USD</code> (it&apos;s ${status.limit.toFixed(2)} a day now).</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <AssistantChat key={current?.id ?? "new"} conversationId={current?.id ?? null} initial={current?.messages ?? []} initialNote={current?.note ?? null} spent={status.spent} limit={status.limit} />
          <nav aria-label="Conversations" className="grid content-start gap-2">
            <Link href="/assistant" className="rounded-md border bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-sunken">New conversation</Link>
            {conversations.map((c) => (
              <Link key={c.id} href={`/assistant?c=${c.id}`} aria-current={c.id === current?.id ? "page" : undefined}
                className={cx("rounded-md px-3 py-2 text-sm", c.id === current?.id ? "bg-accent-soft font-semibold" : "hover:bg-surface-sunken")}>
                <span className="line-clamp-2">{c.title}</span>
                <span className="block text-2xs text-subtle">{new Date(c.updatedAt).toLocaleString("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
