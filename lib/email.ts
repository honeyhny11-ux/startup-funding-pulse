import type { Brief, RankedDeal } from "./types";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const fmtUSD = (m: number | null) =>
  m == null ? "Undisclosed" : m >= 1000 ? `$${(m / 1000).toFixed(1)}B` : m >= 1 ? `$${m.toFixed(1)}M` : `$${Math.round(m * 1000)}K`;

export const fmtRange = (b: Brief) => {
  const f = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return `${f(b.periodStart)} – ${f(b.periodEnd)}`;
};

const dealRow = (d: RankedDeal) => `
<tr>
  <td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top">
    <a href="${esc(d.sources[0]?.url ?? "#")}" style="color:#111;font-weight:600;text-decoration:none">${esc(d.company)}</a>
    ${d.watchlistMatch ? '<span style="background:#fde68a;border-radius:4px;padding:1px 5px;font-size:11px;margin-left:4px">WATCHLIST</span>' : ""}
    <div style="color:#666;font-size:12px">${esc(d.oneLiner)}</div>
  </td>
  <td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top;font-size:13px">${esc(d.sector)}<br><span style="color:#666">${esc(d.stage)}</span></td>
  <td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top;font-size:13px;white-space:nowrap">${esc(d.amountText || fmtUSD(d.amountUSDm))}</td>
  <td style="padding:8px 6px;border-bottom:1px solid #eee;vertical-align:top;font-size:13px">${esc(d.leadInvestors.join(", ") || "—")}</td>
</tr>`;

const section = (title: string, body: string) =>
  `<h2 style="font-size:15px;margin:28px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#0f766e">${title}</h2>${body}`;

export function renderEmail(b: Brief, appUrl: string): string {
  const a = b.analysis;
  const priority = b.deals.filter((d) => d.tier === "priority");
  const focus = b.deals.filter((d) => d.tier === "focus").slice(0, 10);
  const table = (ds: RankedDeal[]) =>
    `<table style="width:100%;border-collapse:collapse">${ds.map(dealRow).join("")}</table>`;
  const list = (items: string[]) => `<ul style="padding-left:18px;margin:0">${items.map((i) => `<li style="margin:6px 0">${i}</li>`).join("")}</ul>`;

  const alerts = [
    ...b.watchlistHits.map((h) => `<b>${esc(h.watchlistName)}</b> ${h.kind === "raised" ? "raised" : "mentioned"}: <a href="${esc(h.url)}">${esc(h.headline)}</a>`),
    ...a.adjacencyAlerts.map((x) => `<b>${esc(x.dealCompany)}</b> is adjacent to <b>${esc(x.watchlistCompany)}</b> — ${esc(x.reason)}`),
  ];

  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111">
<div style="max-width:680px;margin:0 auto;background:#fff;padding:28px 24px">
  <div style="font-size:12px;color:#666">STARTUP FUNDING PULSE · ${fmtRange(b)}</div>
  <h1 style="font-size:22px;line-height:1.3;margin:6px 0 12px">${esc(a.headline)}</h1>
  <p style="font-size:14px;line-height:1.6;color:#333">${esc(a.summary)}</p>
  <p style="font-size:13px;color:#444"><b>${b.stats.totalDeals}</b> deals · <b>${fmtUSD(b.stats.totalUSDm)}</b> disclosed · <b>${priority.length}</b> in your mandate · ${b.articlesScanned} articles from ${b.sources.filter((s) => s.ok).length} sources</p>
  ${alerts.length ? section("🚨 Watchlist & adjacency alerts", `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:14px">${list(alerts)}</div>`) : ""}
  ${section("In your mandate", priority.length ? table(priority) : '<p style="color:#666;font-size:14px">No deals matched both your sectors and stages this week.</p>')}
  ${section("Patterns", list(a.patterns.map((p) => `<b>${esc(p.title)}.</b> ${esc(p.detail)}`)))}
  ${section("Sector momentum", list(a.sectorMomentum.map((m) => `<b>${esc(m.sector)}</b> — ${m.trend}: ${esc(m.note)}`)))}
  ${a.investorMoves.length ? section("Investor moves", list(a.investorMoves.map((m) => `<b>${esc(m.investor)}</b> — ${esc(m.note)}`))) : ""}
  ${focus.length ? section("Partial matches", table(focus)) : ""}
  ${section("This week's actions", list(a.actionItems.map(esc)))}
  <p style="margin-top:28px;font-size:13px"><a href="${esc(appUrl)}" style="color:#0f766e">Open the full brief (all ${b.stats.totalDeals} deals) →</a> · <a href="${esc(appUrl)}/config" style="color:#0f766e">Edit sectors & watchlist</a></p>
  <p style="font-size:11px;color:#999">Generated ${new Date(b.generatedAt).toUTCString()} with ${esc(b.model)}. Deal data is extracted by AI from public news; verify before acting.</p>
</div></body></html>`;
}

export async function sendBriefEmail(b: Brief, to: string, appUrl: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  if (!to) return { sent: false, reason: "No recipient email in config" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Funding Pulse <onboarding@resend.dev>",
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      subject: `Funding Pulse ${fmtRange(b)}: ${b.analysis.headline}`.slice(0, 180),
      html: renderEmail(b, appUrl),
    }),
  });
  if (!res.ok) return { sent: false, reason: `Resend ${res.status}: ${await res.text()}` };
  return { sent: true };
}
