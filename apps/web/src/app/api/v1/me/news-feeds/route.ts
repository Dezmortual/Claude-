import { jsonBody, route } from "@/lib/api/handler";
import { FeedBody } from "@/lib/api/schemas";
import { addFeed, listFeeds } from "@/lib/data";
// Your own RSS or Atom feeds, read with the built-in ones every 30 minutes.
export const GET = route((_r, v) => listFeeds(v));
export const POST = route(async (req, v) => addFeed(v, await jsonBody(req, FeedBody)));
