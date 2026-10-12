import { getConfig } from "./config";
import { analyzeWeek, extractDeals, usedModels } from "./gemini";
import { collectArticles } from "./sources";
import { getJSON, setJSON, KEYS } from "./store";
import type { Analysis, Article, Brief, BriefStats, Deal, PulseConfig, RankedDeal, WatchlistHit } from "./types";

const BATCH = 45;

const norm = (s: string) =>
  s.toLowerCase().replace(/\b(pvt|private|ltd|limited|technologies|technology|labs|inc)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const mentions = (haystack: string, name: string) => {
  const h = ` ${norm(haystack)} `;
  const n = norm(name);
  return n.length > 1 && h.includes(` ${n} `);
};

const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => x && !seen.has(norm(x)) && seen.add(norm(x)));
};

function mergeDeals(deals: Deal[]): Deal[] {
  const byKey = new Map<string, Deal>();
  for (const d of deals) {
    const key = norm(d.company);
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...d });
      continue;
    }
    prev.articleIds = [...new Set([...prev.articleIds, ...d.articleIds])];
    prev.leadInvestors = uniq([...prev.leadInvestors, ...d.leadInvestors]);
    prev.otherInvestors = uniq([...prev.otherInvestors, ...d.otherInvestors]).filter(
      (x) => !prev.leadInvestors.some((l) => norm(l) === norm(x)),
    );
    prev.matchedFocusSectors = uniq([...prev.matchedFocusSectors, ...d.matchedFocusSectors]);
    prev.amountUSDm ??= d.amountUSDm;
    if (!prev.amountText) prev.amountText = d.amountText;
    if (prev.stage === "Undisclosed") prev.stage = d.stage;
    if (!prev.city) prev.city = d.city;
  }
  // Second pass: "TailBlaze" and "TailBlaze Longevity" with the same amount are one round.
  const out: Deal[] = [];
  for (const d of [...byKey.values()].sort((a, b) => a.company.length - b.company.length)) {
    const same = out.find((o) => {
      const [x, y] = [norm(o.company), norm(d.company)];
      const amountsAgree = o.amountUSDm == null || d.amountUSDm == null || Math.abs(o.amountUSDm - d.amountUSDm) < 0.05 * Math.max(o.amountUSDm, d.amountUSDm);
      return y.startsWith(x + " ") && amountsAgree;
    });
    if (!same) {
      out.push(d);
      continue;
    }
    same.articleIds = [...new Set([...same.articleIds, ...d.articleIds])];
    same.leadInvestors = uniq([...same.leadInvestors, ...d.leadInvestors]);
    same.otherInvestors = uniq([...same.otherInvestors, ...d.otherInvestors]);
    same.amountUSDm ??= d.amountUSDm;
  }
  return out;
}

function rank(deals: Deal[], articles: Article[], cfg: PulseConfig): { ranked: RankedDeal[]; hits: WatchlistHit[] } {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const hits: WatchlistHit[] = [];
  const ranked = deals.map((d): RankedDeal => {
    const sources = d.articleIds
      .map((id) => byId.get(id))
      .filter((a): a is Article => !!a)
      .map((a) => ({ source: a.source, url: a.url, title: a.title }));
    const stageMatch = cfg.focusStages.includes(d.stage);
    const sectorMatch = d.matchedFocusSectors.length > 0;
    const watch = cfg.watchlist.find((w) => mentions(d.company, w.name) || norm(d.company) === norm(w.name));
    if (watch) {
      hits.push({ watchlistName: watch.name, kind: "raised", company: d.company, headline: sources[0]?.title ?? "", url: sources[0]?.url ?? "" });
    }
    const score =
      (watch ? 100 : 0) + (sectorMatch ? 40 : 0) + (stageMatch ? 30 : 0) +
      Math.min(d.amountUSDm ?? 0, 50) / 5 + Math.min(sources.length, 5) * 2;
    const tier = watch || (sectorMatch && stageMatch) ? "priority" : sectorMatch || stageMatch ? "focus" : "other";
    return { ...d, tier, score: Math.round(score), stageMatch, watchlistMatch: watch?.name ?? null, sources };
  });
  ranked.sort((a, b) => b.score - a.score);

  // Watchlist companies that appear in funding headlines without being the one raising
  // (e.g. as an investor, acquirer or comparison).
  for (const w of cfg.watchlist) {
    if (hits.some((h) => h.watchlistName === w.name)) continue;
    const a = articles.find((a) => mentions(a.title, w.name));
    if (a) hits.push({ watchlistName: w.name, kind: "mentioned", company: w.name, headline: a.title, url: a.url });
  }
  return { ranked, hits };
}

function computeStats(deals: RankedDeal[], prev: BriefStats | null): BriefStats {
  const sectors = new Map<string, { deals: number; usdM: number }>();
  const stages = new Map<string, number>();
  for (const d of deals) {
    const s = sectors.get(d.sector) ?? { deals: 0, usdM: 0 };
    s.deals++;
    s.usdM += d.amountUSDm ?? 0;
    sectors.set(d.sector, s);
    stages.set(d.stage, (stages.get(d.stage) ?? 0) + 1);
  }
  const prevBySector = new Map(prev?.bySector.map((s) => [s.sector, s.deals]) ?? []);
  return {
    totalDeals: deals.length,
    totalUSDm: Math.round(deals.reduce((t, d) => t + (d.amountUSDm ?? 0), 0) * 10) / 10,
    disclosedDeals: deals.filter((d) => d.amountUSDm != null).length,
    bySector: [...sectors.entries()]
      .map(([sector, v]) => ({ sector, deals: v.deals, usdM: Math.round(v.usdM * 10) / 10, prevDeals: prev ? prevBySector.get(sector) ?? 0 : null }))
      .sort((a, b) => b.deals - a.deals),
    byStage: [...stages.entries()].map(([stage, deals]) => ({ stage, deals })).sort((a, b) => b.deals - a.deals),
  };
}

// investor (normalised) -> sector -> id of the brief where that pairing was first seen
function fallbackAnalysis(deals: RankedDeal[], stats: BriefStats): Analysis {
  const priority = deals.filter((d) => d.tier === "priority");
  const top = stats.bySector.slice(0, 3).map((s) => `${s.sector} (${s.deals})`).join(", ");
  return {
    headline: `${stats.totalDeals} Indian startup rounds last week, ${priority.length} in your mandate`,
    summary: `Most active sectors: ${top}. AI analysis was unavailable for this run because Gemini was overloaded, so the deals below are ranked by your mandate without commentary. Regenerate later for the full analysis.`,
    patterns: [],
    sectorMomentum: [],
    investorMoves: [],
    adjacencyAlerts: [],
    actionItems: priority.slice(0, 3).map((d) => `Look at ${d.company} (${d.stage}, ${d.sector}).`),
  };
}

type InvestorHistory = Record<string, Record<string, string>>;

export async function generateBrief(): Promise<Brief> {
  const cfg = await getConfig();
  usedModels.clear();
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 864e5);

  const { articles, sources } = await collectArticles(cfg.focusSectors, since);
  if (articles.length === 0) throw new Error("No funding articles found in the live feeds this week");

  // Extract deals from all batches in parallel; a failed batch is skipped, not fatal.
  const batches: Article[][] = [];
  for (let i = 0; i < articles.length; i += BATCH) batches.push(articles.slice(i, i + BATCH));
  const settled = await Promise.allSettled(batches.map((b) => extractDeals(b, cfg)));
  const extracted: Deal[] = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (settled.every((r) => r.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
  const { ranked, hits } = rank(mergeDeals(extracted), articles, cfg);

  const briefId = now.toISOString().slice(0, 10);
  // Compare against the most recent brief that is at least 5 days old (last week's).
  const cutoff = new Date(now.getTime() - 5 * 864e5).toISOString().slice(0, 10);
  const prevEntry = (await getHistory()).find((h) => h.id <= cutoff);
  const prev = prevEntry ? await getJSON<Brief>(KEYS.brief(prevEntry.id)) : null;
  const stats = computeStats(ranked, prev?.stats ?? null);

  const history = (await getJSON<InvestorHistory>(KEYS.investors)) ?? {};
  const hasHistory = Object.values(history).some((s) => Object.values(s).some((id) => id < briefId));
  const newInvestors: Brief["newInvestors"] = [];
  for (const d of ranked) {
    for (const inv of [...d.leadInvestors, ...d.otherInvestors]) {
      const k = norm(inv);
      if (!k) continue;
      const seen = (history[k] ??= {});
      seen[d.sector] ??= briefId;
      if (hasHistory && d.tier !== "other" && seen[d.sector] === briefId) {
        newInvestors.push({ investor: inv, sector: d.sector, company: d.company });
      }
    }
  }

  const compactDeals = ranked.map((d) => ({
    company: d.company, what: d.oneLiner, sector: d.sector, focus: d.matchedFocusSectors, stage: d.stage,
    usdM: d.amountUSDm, amount: d.amountText, lead: d.leadInvestors, others: d.otherInvestors.slice(0, 6),
    city: d.city, tier: d.tier, watchlist: d.watchlistMatch,
  }));
  // If every Gemini model is busy for the analysis step, still publish the ranked
  // deals with a basic summary instead of failing the whole Monday run.
  const analysis = await analyzeWeek({ cfg, deals: compactDeals, stats, watchlistHits: hits, newInvestors: newInvestors.slice(0, 30), hasHistory })
    .catch((err) => {
      console.error("analyzeWeek failed, using fallback summary", err);
      return fallbackAnalysis(ranked, stats);
    });

  const brief: Brief = {
    id: briefId,
    generatedAt: now.toISOString(),
    periodStart: since.toISOString(),
    periodEnd: now.toISOString(),
    model: [...usedModels].join(", "),
    sources,
    articlesScanned: articles.length,
    deals: ranked,
    stats,
    watchlistHits: hits,
    newInvestors,
    analysis,
    configSnapshot: cfg,
  };

  const history_ = await getHistory();
  const entry = { id: brief.id, deals: stats.totalDeals, usdM: stats.totalUSDm };
  await Promise.all([
    setJSON(KEYS.latest, brief),
    setJSON(KEYS.brief(brief.id), brief),
    setJSON(KEYS.history, [entry, ...history_.filter((h) => h.id !== brief.id)].slice(0, 26)),
    setJSON(KEYS.investors, history),
  ]);
  return brief;
}

export async function getBrief(id?: string): Promise<Brief | null> {
  return getJSON<Brief>(id ? KEYS.brief(id) : KEYS.latest);
}

export async function getHistory() {
  return (await getJSON<{ id: string; deals: number; usdM: number }[]>(KEYS.history)) ?? [];
}
