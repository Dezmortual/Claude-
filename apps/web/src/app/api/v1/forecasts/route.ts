import { qs, route } from "@/lib/api/handler";
import { listForecasts, type ForecastQuery } from "@/lib/data";
export const GET = route((req, v) => {
  const p = qs(req);
  return listForecasts(v, {
    market: (p.get("market") ?? "all") as ForecastQuery["market"], tab: (p.get("tab") ?? "investing") as ForecastQuery["tab"],
    signal: (p.get("signal") ?? "all") as ForecastQuery["signal"], volatility: (p.get("volatility") ?? "all") as ForecastQuery["volatility"],
    q: p.get("q") ?? "", sort: p.get("sort") ?? undefined, dir: (p.get("dir") ?? undefined) as ForecastQuery["dir"],
    page: Number(p.get("page") ?? 1), perPage: Math.min(Number(p.get("per_page") ?? 20), 100),
  });
}, 30);
