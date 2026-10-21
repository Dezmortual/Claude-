import Link from "next/link";
import { AuthForm } from "@/components/client/AuthForm";
import { Card } from "@/components/ui";

export const metadata = { title: "Reset your password" };

export default function Page() {
  return (
    <div className="mx-auto grid max-w-md gap-6 py-6">
      <div className="grid gap-2 text-center">
        <h1 className="text-xl">Reset your password</h1>
        <p className="text-muted">We&apos;ll email you a link to choose a new one.</p>
      </div>
      <Card className="p-6"><AuthForm mode="forgot" /></Card>
      <p className="text-center text-sm text-muted"><Link href="/sign-in" className="font-semibold text-accent hover:underline">Back to sign in</Link></p>
    </div>
  );
}
