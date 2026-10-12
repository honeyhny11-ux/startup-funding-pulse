import { NextRequest, NextResponse } from "next/server";
import { generateBrief } from "@/lib/brief";
import { sendBriefEmail } from "@/lib/email";
import { appUrl, isAdmin } from "@/lib/auth";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Manual "generate now" from the dashboard. ?email=1 also sends the email.
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Invalid admin key" }, { status: 401 });
  try {
    const brief = await generateBrief();
    const email = req.nextUrl.searchParams.get("email")
      ? await sendBriefEmail(brief, brief.configSnapshot.email, appUrl(req))
      : { sent: false, reason: "not requested" };
    return NextResponse.json({ ok: true, id: brief.id, deals: brief.stats.totalDeals, email });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
