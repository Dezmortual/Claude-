import { ButtonLink, EmptyState } from "@/components/ui";
export default function NotFound() {
  return <EmptyState title="There's nothing at this address" action={<ButtonLink href="/forecasts">Go to forecasts</ButtonLink>}>The link may be old, or the asset may no longer be listed.</EmptyState>;
}
