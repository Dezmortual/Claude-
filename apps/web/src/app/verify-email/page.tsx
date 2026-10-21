import Link from "next/link";
import { Card } from "@/components/ui";
import { DataError } from "@/lib/data";
import { verifyEmail } from "@/lib/server/auth";

export const metadata = { title: "Confirm your email" };

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let ok = false, message = "This link is missing its code. Open the link from the email again.";
  if (token && token.length <= 100) {
    try { await verifyEmail(token); ok = true; message = "Your email is confirmed. You can sign in now."; }
    catch (e) { message = e instanceof DataError ? e.message : "Something went wrong. Try the link again."; }
  }
  return (
    <div className="mx-auto grid max-w-md gap-6 py-6">
      <h1 className="text-center text-xl">{ok ? "Email confirmed" : "That link didn't work"}</h1>
      <Card className="grid gap-4 p-6 text-sm">
        <p role="status" className="text-muted">{message}</p>
        <Link href="/sign-in" className="font-semibold text-accent hover:underline">Go to sign in</Link>
      </Card>
    </div>
  );
}
