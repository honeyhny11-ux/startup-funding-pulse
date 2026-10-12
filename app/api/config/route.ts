import { NextRequest, NextResponse } from "next/server";
import { getConfig, saveConfig, validateConfig } from "@/lib/config";
import { isAdmin } from "@/lib/auth";
import { storageMode } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ config: await getConfig(), storageMode });
}

export async function PUT(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  const cfg = validateConfig(await req.json());
  await saveConfig(cfg);
  return NextResponse.json({ config: cfg, storageMode });
}
