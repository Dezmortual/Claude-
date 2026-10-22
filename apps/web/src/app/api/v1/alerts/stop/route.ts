import { qs, route } from "@/lib/api/handler";
import { stopAlertByToken } from "@/lib/data";
// The one-click stop from an alert email (RFC 8058 List-Unsubscribe-Post). No session: the token is the key.
export const POST = route((req) => stopAlertByToken(qs(req).get("t") ?? ""), 0, { public: true });
