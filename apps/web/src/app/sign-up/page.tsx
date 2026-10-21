import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/client/AuthForm";
import { Card } from "@/components/ui";
import { safeNext } from "@/lib/query";
import { viewer } from "@/lib/session";

export const metadata = { title: "Create your account" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; deleted?: string; signedout?: string }> }) {
  const { next, deleted, signedout } = await searchParams;
  if ((await viewer()).user) redirect(safeNext(next));
  return (
    <div className="mx-auto grid max-w-md gap-6 py-6">
      <div className="grid gap-2 text-center">
        <h1 className="text-xl">Create your account</h1>
        <p className="text-muted">Only the owner email set in the server&apos;s configuration can create an account.</p>
      </div>
      <Card className="p-6"><AuthForm mode="sign-up" next={safeNext(next)} /></Card>
      <p className="text-center text-sm text-muted">Have an account? <Link href={`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-accent hover:underline">Sign in</Link></p>
    </div>
  );
}
