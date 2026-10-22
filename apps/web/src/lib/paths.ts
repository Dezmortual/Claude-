// Pages reachable without a session in the private build.
export const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/verify-email", "/legal"];
// The landing page is public only when PUBLIC_LANDING=true; otherwise only a signed-in owner can preview it.
export const publicLanding = () => process.env.PUBLIC_LANDING === "true";
export const isPublicPath = (p: string) =>
  PUBLIC_PATHS.some((x) => p === x || p.startsWith(`${x}/`)) || (publicLanding() && p === "/welcome");
/** Where a signed-out visitor to "/" is sent. */
export const guestHome = () => (publicLanding() ? "/welcome" : "/sign-in");
