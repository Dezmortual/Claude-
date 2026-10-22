// Netlify scheduled function: runs the app's jobs every 30 minutes on the production deploy, the same plan as
// .github/workflows/forecast-jobs.yml (use one or the other). Alerts every run, publish + score hourly, cleanup daily.
// "Run now" in Netlify (Logs -> Functions -> jobs) triggers it by hand.
export default async () => {
  const base = process.env.APP_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.log("APP_URL or CRON_SECRET not set; skipping");
    return;
  }
  const now = new Date();
  const jobs = ["alerts"];
  if (now.getUTCMinutes() < 30) jobs.push("publish");
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 30) jobs.push("cleanup");
  let failed = 0;
  for (const job of jobs) {
    try {
      const res = await fetch(`${base}/api/cron/${job}`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(25_000),
      });
      console.log(job, res.status, (await res.text()).slice(0, 300));
      if (!res.ok) failed++;
    } catch (e) {
      failed++;
      console.log(job, "failed:", e instanceof Error ? e.message : e);
    }
  }
  if (failed) throw new Error(`${failed} job(s) failed`);
};

export const config = { schedule: "4,34 * * * *" };
