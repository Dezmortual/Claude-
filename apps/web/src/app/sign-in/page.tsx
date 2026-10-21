import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/client/AuthForm";
import { Card } from "@/components/ui";
import { safeNext } from "@/lib/query";
import { viewer } from "@/lib/session";

export const metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if ((await viewer()).user) redirect(safeNext(next));
  return (
    <div className="mx-auto grid max-w-md gap-6 py-6">
      <div className="grid gap-2 text-center">
        <h1 className="text-xl">Sign in</h1>
        <p className="text-muted">Your forecasts, watchlist and alerts.</p>
      </div>
      <Card className="p-6"><AuthForm mode="sign-in" next={safeNext(next)} /></Card>
      <p className="text-center text-sm text-muted">New here? <Link href={`/sign-up${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-accent hover:underline">Create an account</Link></p>
    </div>
  );
}
