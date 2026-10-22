// Netlify scheduled function: runs the app's jobs every 30 minutes on the production deploy, the same plan as
// .github/workflows/forecast-jobs.yml (use one or the other). Prices market by market and alerts every run, publish +
// score hourly, cleanup daily.
// "Run now" in Netlify (Logs -> Functions -> jobs) triggers it by hand.
export default async () => {
  const base = process.env.APP_URL || process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.log("APP_URL or CRON_SECRET not set; skipping");
    return;
  }
  const now = new Date();
  // Prices first, one market per request, so the jobs after them read fresh bars without fetching.
  const jobs = ["crypto", "forex", "stocks", "commodities", "indices", "etfs", "bonds"].map((m) => `ingest-${m}`);
  jobs.push("alerts");
  if (now.getUTCMinutes() < 30) jobs.push("publish");
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 30) jobs.push("cleanup");
  let failed = 0;
  for (const job of jobs) {
    try {
      const res = await fetch(`${base}/api/cron/${job}`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(12_000),
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
