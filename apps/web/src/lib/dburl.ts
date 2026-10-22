// postgres.js sends any connection-string option it doesn't know to the server as a setting, and the server refuses
// libpq-only ones such as channel_binding=require, which Neon puts in its strings. Drop them; TLS still follows sslmode.
const LIBPQ_ONLY = ["channel_binding", "gssencmode", "sslcompression", "sslcrl", "sslcrldir", "sslsni", "sslcert", "sslkey", "sslpassword", "krbsrvname", "gsslib", "requiressl"];

export function dbUrl(raw: string) {
  const u = new URL(raw);
  for (const k of LIBPQ_ONLY) u.searchParams.delete(k);
  return u.toString();
}
