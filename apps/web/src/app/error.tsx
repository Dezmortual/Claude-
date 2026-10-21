"use client";
import { Button, EmptyState } from "@/components/ui";
export default function Error({ reset }: { reset: () => void }) {
  return <EmptyState title="Something went wrong loading this page" action={<Button onClick={reset}>Try again</Button>}>Your data is safe. If it keeps happening, try again in a minute.</EmptyState>;
}
