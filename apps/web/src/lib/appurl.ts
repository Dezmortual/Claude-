/** The site's public address: APP_URL when set, otherwise what the host reports (Vercel's production domain, or
 *  Netlify's site URL), otherwise the local dev server. */
export function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return process.env.URL || "http://localhost:3000";
}
