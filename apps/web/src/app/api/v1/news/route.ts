import { route } from "@/lib/api/handler";
import { NewsQuery } from "@/lib/api/schemas";
import { listNews } from "@/lib/data";
// Stories from Alpaca and RSS, newest first, with their mood and the assets they mention.
export const GET = route((req, v) => listNews(v, NewsQuery.parse(Object.fromEntries(new URL(req.url).searchParams))));
