import Link from "next/link";
import { getBrief, getHistory } from "@/lib/brief";
import { fmtRange, fmtUSD } from "@/lib/email";
import type { RankedDeal } from "@/lib/types";
import GenerateButton from "./GenerateButton";

export const dynamic = "force-dynamic";

function DealTable({ deals }: { deals: RankedDeal[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Sector · Stage</th>
            <th>Amount</th>
            <th>Lead investors</th>
            <th className="hide-sm">Sources</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.company}>
              <td>
                <b>{d.company}</b>
                {d.watchlistMatch && <span className="tag watch" style={{ marginLeft: 6 }}>WATCHLIST</span>}
                <div className="sub">{d.oneLiner}{d.city ? ` · ${d.city}` : ""}</div>
                <div>{d.matchedFocusSectors.map((s) => <span key={s} className="tag">{s}</span>)}</div>
              </td>
              <td>
                {d.sector}
                <div className="sub">{d.stage}{d.stageMatch ? " ✓" : ""}</div>
              </td>
              <td style={{ whiteSpace: "nowrap" }}>
                {fmtUSD(d.amountUSDm)}
                {d.amountText && <div className="sub">{d.amountText}</div>}
              </td>
              <td>
                {d.leadInvestors.join(", ") || "—"}
                {d.otherInvestors.length > 0 && <div className="sub">+ {d.otherInvestors.slice(0, 4).join(", ")}{d.otherInvestors.length > 4 ? "…" : ""}</div>}
              </td>
              <td className="hide-sm small">
                {d.sources.slice(0, 3).map((s, i) => (
                  <div key={i}><a href={s.url} target="_blank" rel="noreferrer" title={s.title}>{s.source}</a></div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const [brief, history] = await Promise.all([getBrief(id), getHistory()]);

  if (!brief) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="kicker">No brief yet</div>
        <h1>Your Monday funding brief will appear here.</h1>
        <p className="muted">
          It is generated automatically every Monday at 6:00 AM IST from live startup news feeds. You can also generate one now.
        </p>
        <GenerateButton />
      </div>
    );
  }

  const a = brief.analysis;
  const priority = brief.deals.filter((d) => d.tier === "priority");
  const focus = brief.deals.filter((d) => d.tier === "focus");
  const other = brief.deals.filter((d) => d.tier === "other");
  const maxSector = Math.max(1, ...brief.stats.bySector.map((s) => s.deals));
  const alertCount = brief.watchlistHits.length + a.adjacencyAlerts.length;

  return (
    <>
      <div className="kicker">Weekly brief · {fmtRange(brief)} · for {brief.configSnapshot.ownerName}</div>
      <h1>{a.headline}</h1>
      <p className="lede">{a.summary}</p>

      <div className="kpis">
        <div className="kpi"><b>{brief.stats.totalDeals}</b><span>funding rounds found</span></div>
        <div className="kpi"><b>{fmtUSD(brief.stats.totalUSDm)}</b><span>disclosed capital ({brief.stats.disclosedDeals} deals)</span></div>
        <div className="kpi"><b>{priority.length}</b><span>in your mandate</span></div>
        <div className="kpi"><b>{alertCount}</b><span>watchlist alerts</span></div>
        <div className="kpi"><b>{brief.articlesScanned}</b><span>articles from {brief.sources.filter((s) => s.ok).length} sources</span></div>
      </div>

      {alertCount > 0 && (
        <section className="card alert">
          <h2>Watchlist &amp; adjacency alerts</h2>
          <ul className="clean">
            {brief.watchlistHits.map((h, i) => (
              <li key={`w${i}`}>
                <span className="tag watch">{h.kind === "raised" ? "RAISED" : "MENTIONED"}</span> <b>{h.watchlistName}</b> —{" "}
                <a href={h.url} target="_blank" rel="noreferrer">{h.headline}</a>
              </li>
            ))}
            {a.adjacencyAlerts.map((x, i) => (
              <li key={`a${i}`}>
                <span className="tag watch">ADJACENT</span> <b>{x.dealCompany}</b> raised, next to <b>{x.watchlistCompany}</b>: {x.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>In your mandate: focus sector + focus stage ({priority.length})</h2>
        {priority.length ? <DealTable deals={priority} /> : <p className="muted">No deals matched both your sectors and stages this week.</p>}
      </section>

      <div className="grid g2" style={{ marginTop: 20 }}>
        <section className="card" style={{ marginTop: 0 }}>
          <h2>Patterns Gemini spotted</h2>
          <ul className="clean">
            {a.patterns.map((p, i) => (
              <li key={i}>
                <b>{p.title}</b>
                <div>{p.detail}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card" style={{ marginTop: 0 }}>
          <h2>This week&apos;s actions</h2>
          <ul className="clean">{a.actionItems.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      </div>

      <div className="grid g2" style={{ marginTop: 20 }}>
        <section className="card" style={{ marginTop: 0 }}>
          <h2>Sector momentum</h2>
          <ul className="clean">
            {a.sectorMomentum.map((m, i) => (
              <li key={i}>
                <b>{m.sector}</b> <span className={`trend-${m.trend}`}>{m.trend === "heating" ? "▲ heating" : m.trend === "cooling" ? "▼ cooling" : m.trend === "new" ? "● baseline" : "■ steady"}</span>
                <div className="small muted">{m.note}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="card" style={{ marginTop: 0 }}>
          <h2>Deal count by sector</h2>
          <table>
            <tbody>
              {brief.stats.bySector.map((s) => (
                <tr key={s.sector}>
                  <td style={{ width: "42%" }}>{s.sector}</td>
                  <td style={{ width: "38%" }}><div className="bar" style={{ width: `${(s.deals / maxSector) * 100}%` }} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {s.deals}
                    {s.prevDeals != null && <span className="small muted"> (prev {s.prevDeals})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {a.investorMoves.length > 0 && (
        <section className="card">
          <h2>Investor moves</h2>
          <ul className="clean">
            {a.investorMoves.map((m, i) => (
              <li key={i}><b>{m.investor}</b> — {m.note}</li>
            ))}
          </ul>
        </section>
      )}

      {focus.length > 0 && (
        <section className="card">
          <h2>Partial matches: sector or stage ({focus.length})</h2>
          <DealTable deals={focus} />
        </section>
      )}

      {other.length > 0 && (
        <section className="card">
          <details>
            <summary>Everything else this week ({other.length})</summary>
            <div style={{ marginTop: 12 }}><DealTable deals={other} /></div>
          </details>
        </section>
      )}

      <section className="card">
        <h2>Sources &amp; history</h2>
        <p className="small">
          {brief.sources.map((s) => `${s.name}${s.ok ? ` (${s.articles})` : " (unavailable)"}`).join(" · ")}
        </p>
        {history.length > 1 && (
          <p className="small">
            Past briefs:{" "}
            {history.map((h) => (
              <Link key={h.id} href={`/?id=${h.id}`} style={{ marginRight: 10 }}>{h.id} ({h.deals})</Link>
            ))}
          </p>
        )}
        <p className="small muted">
          Generated {new Date(brief.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST with {brief.model}. Deal data is extracted by AI from public news; verify before acting.
        </p>
        <GenerateButton label="Regenerate now" />
      </section>
    </>
  );
}
