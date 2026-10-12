export const STAGES = [
  "Pre-Seed", "Seed", "Pre-Series A", "Series A", "Series B", "Series C",
  "Series D+", "Growth / PE", "Debt", "Bridge", "Undisclosed",
] as const;
export type Stage = (typeof STAGES)[number];

// Fixed taxonomy so week-over-week counts are comparable.
export const SECTORS = [
  "Fintech", "B2B SaaS", "AI / Deep Tech", "Climate & EV", "HealthTech", "EdTech",
  "D2C & Consumer Brands", "E-commerce & Quick Commerce", "Logistics & Mobility",
  "AgriTech & Food", "Gaming & Media", "PropTech & Construction",
  "Manufacturing & Industrial", "SpaceTech & Defence", "Web3 & Crypto",
  "Travel & Hospitality", "HR & Workforce", "Other",
] as const;
export type Sector = (typeof SECTORS)[number];

export interface WatchItem { name: string; note?: string }

export interface PulseConfig {
  ownerName: string;
  email: string;
  focusSectors: string[];      // free text, matched semantically by Gemini
  focusStages: Stage[];
  watchlist: WatchItem[];
}

export interface Article {
  id: number;
  title: string;
  snippet: string;
  url: string;
  source: string;
  publishedAt: string; // ISO
}

export interface Deal {
  company: string;
  oneLiner: string;
  sector: Sector;
  matchedFocusSectors: string[];
  stage: Stage;
  amountUSDm: number | null;
  amountText: string;
  leadInvestors: string[];
  otherInvestors: string[];
  city: string;
  articleIds: number[];
}

export type Tier = "priority" | "focus" | "other";

export interface RankedDeal extends Deal {
  tier: Tier;
  score: number;
  stageMatch: boolean;
  watchlistMatch: string | null;
  sources: { source: string; url: string; title: string }[];
}

export interface WatchlistHit {
  watchlistName: string;
  kind: "raised" | "mentioned";
  company: string;
  headline: string;
  url: string;
}

export interface SectorStat { sector: string; deals: number; usdM: number; prevDeals: number | null }

export interface BriefStats {
  totalDeals: number;
  totalUSDm: number;
  disclosedDeals: number;
  bySector: SectorStat[];
  byStage: { stage: string; deals: number }[];
}

export interface Analysis {
  headline: string;
  summary: string;
  patterns: { title: string; detail: string; companies: string[] }[];
  sectorMomentum: { sector: string; trend: "heating" | "steady" | "cooling" | "new"; note: string }[];
  investorMoves: { investor: string; note: string; companies: string[] }[];
  adjacencyAlerts: { watchlistCompany: string; dealCompany: string; reason: string }[];
  actionItems: string[];
}

export interface Brief {
  id: string;            // YYYY-MM-DD of generation
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  model: string;
  sources: { name: string; articles: number; ok: boolean }[];
  articlesScanned: number;
  deals: RankedDeal[];
  stats: BriefStats;
  watchlistHits: WatchlistHit[];
  newInvestors: { investor: string; sector: string; company: string }[];
  analysis: Analysis;
  configSnapshot: PulseConfig;
}
