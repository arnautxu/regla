import { NextResponse, type NextRequest } from "next/server";
import { accountMode } from "@/lib/account-mode";

export function proxy(req: NextRequest) {
  const signedWebhook = ["/api/billing/webhook", "/api/voz/webhook"].includes(req.nextUrl.pathname)
    || (req.method === "POST" && req.nextUrl.pathname === "/api/billing/apple");
  if (accountMode() && !signedWebhook && !["GET", "HEAD", "OPTIONS"].includes(req.method)
    && req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = { matcher: "/api/:path*" };
