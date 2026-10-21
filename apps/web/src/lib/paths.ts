// Pages reachable without a session in the private build.
export const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/verify-email", "/legal"];
export const isPublicPath = (p: string) => PUBLIC_PATHS.some((x) => p === x || p.startsWith(`${x}/`));
