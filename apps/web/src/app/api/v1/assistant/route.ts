import { jsonBody, route } from "@/lib/api/handler";
import { AskBody } from "@/lib/api/schemas";
import { ask, assistantStatus, listConversations } from "@/lib/data";
// The research assistant: ask a question (new conversation or a follow-up); list conversations and today's spend.
export const maxDuration = 300;
export const GET = route(async (_r, v) => ({ status: await assistantStatus(v), conversations: await listConversations(v) }));
export const POST = route(async (req, v) => ask(v, await jsonBody(req, AskBody)));
