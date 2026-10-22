/** The site's public address: APP_URL when it is a valid http(s) URL, otherwise what the host reports (Vercel's
 *  production domain, or Netlify's site URL), otherwise the local dev server. A malformed APP_URL (a placeholder pasted
 *  by mistake) is ignored rather than failing the build. */
export function appUrl() {
  for (const v of [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`, process.env.URL]) {
    if (v && valid(v.trim())) return v.trim().replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

function valid(v: string) {
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && /^[a-z0-9.-]+$/i.test(u.hostname);
  } catch {
    return false;
  }
}
