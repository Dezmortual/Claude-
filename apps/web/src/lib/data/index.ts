// The only import screens and routes use. /replica-backend swaps "./fake" for the Supabase implementation
// with the same exports; nothing else changes.
export * from "./fake";
export * from "./types";
export { PLANS, MARKETS } from "./catalogue";
