import Link from "next/link";
import { AuthForm } from "@/components/client/AuthForm";
import { Card } from "@/components/ui";

export const metadata = { title: "Choose a new password" };

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto grid max-w-md gap-6 py-6">
      <div className="grid gap-2 text-center">
        <h1 className="text-xl">Choose a new password</h1>
        <p className="text-muted">You&apos;ll be signed out on every other device.</p>
      </div>
      <Card className="p-6">
        {token ? <AuthForm mode="reset" token={token} /> : (
          <p className="text-sm text-muted">This link is missing its code. <Link href="/forgot-password" className="font-semibold text-accent underline">Ask for a new one</Link>.</p>
        )}
      </Card>
    </div>
  );
}
