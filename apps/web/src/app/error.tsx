"use client";
import { Button, EmptyState } from "@/components/ui";
export default function Error({ reset }: { reset: () => void }) {
  return <EmptyState title="This page didn't load" action={<Button onClick={reset}>Try again</Button>}>Nothing you saved is lost. Try again, or come back in a minute.</EmptyState>;
}
