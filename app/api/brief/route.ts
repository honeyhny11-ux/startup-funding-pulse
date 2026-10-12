import { NextRequest, NextResponse } from "next/server";
import { getBrief } from "@/lib/brief";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const brief = await getBrief(req.nextUrl.searchParams.get("id") ?? undefined);
  return brief ? NextResponse.json(brief) : NextResponse.json({ error: "No brief yet" }, { status: 404 });
}
