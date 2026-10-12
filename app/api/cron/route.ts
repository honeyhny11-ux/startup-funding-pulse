import { NextRequest, NextResponse } from "next/server";
import { generateBrief } from "@/lib/brief";
import { sendBriefEmail } from "@/lib/email";
import { appUrl } from "@/lib/auth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Triggered by Vercel Cron every Monday 00:30 UTC (06:00 IST). See vercel.json.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const brief = await generateBrief();
    const email = await sendBriefEmail(brief, brief.configSnapshot.email, appUrl(req));
    return NextResponse.json({ ok: true, id: brief.id, deals: brief.stats.totalDeals, email });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
