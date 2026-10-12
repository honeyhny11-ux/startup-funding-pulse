import { NextRequest } from "next/server";

// Simple shared-secret guard for writes. If ADMIN_KEY is unset (local dev), writes are open.
export function isAdmin(req: NextRequest) {
  const key = process.env.ADMIN_KEY;
  return !key || req.headers.get("x-admin-key") === key;
}

export function appUrl(req?: NextRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return req ? new URL(req.url).origin : "http://localhost:3000";
}
