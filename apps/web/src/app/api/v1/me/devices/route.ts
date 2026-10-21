import { NextResponse } from "next/server";
// Push tokens are stored once the mobile app and the backend exist.
export const POST = () => NextResponse.json({ error: "not_implemented", message: "Push registration arrives with the mobile app" }, { status: 501 });
