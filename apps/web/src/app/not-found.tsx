import { ButtonLink, EmptyState } from "@/components/ui";
export default function NotFound() {
  return <EmptyState title="We couldn't find that page" action={<ButtonLink href="/forecasts">Go to forecasts</ButtonLink>}>The link may be old, or the asset may no longer be listed.</EmptyState>;
}
