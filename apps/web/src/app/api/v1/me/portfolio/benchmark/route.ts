import { jsonBody, route } from "@/lib/api/handler";
import { BenchmarkBody } from "@/lib/api/schemas";
import { setBenchmark } from "@/lib/data";
export const PUT = route(async (req, v) => { await setBenchmark(v, (await jsonBody(req, BenchmarkBody)).slug); });
