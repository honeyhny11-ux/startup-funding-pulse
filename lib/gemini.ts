import { GoogleGenAI, ThinkingLevel, Type, type Schema } from "@google/genai";
import { SECTORS, STAGES, type Analysis, type Article, type Deal, type PulseConfig } from "./types";

// "gemini-flash-latest" always points at Google's current Flash model. If it is
// overloaded (503) or rate-limited (429) we fall back to other Flash models.
export const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const MODELS = [...new Set([MODEL, ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview").split(",").map((s) => s.trim()).filter(Boolean)])];

// Models that actually produced output during this process (shown on the brief).
export const usedModels = new Set<string>();

let _ai: GoogleGenAI | null = null;
function ai() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return (_ai ??= new GoogleGenAI({ apiKey }));
}

async function generateJSON<T>(prompt: string, schema: Schema, opts: { fast?: boolean } = {}): Promise<T> {
  let lastErr: unknown;
  // Up to 5 attempts across the model list; each call is capped so the whole run
  // fits inside Vercel's 300s function limit.
  for (let i = 0; i < Math.min(5, MODELS.length * 2); i++) {
    const model = MODELS[i % MODELS.length];
    try {
      const res = await ai().models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.2,
          httpOptions: { timeout: 75_000 },
          // Extraction is mechanical; keep thinking low so it is fast.
          ...(opts.fast ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        },
      });
      const out = JSON.parse(res.text ?? "") as T;
      usedModels.add(model);
      return out;
    } catch (err) {
      lastErr = err;
      console.warn(`Gemini ${model} failed: ${String(err).slice(0, 160)}`);
      if (/API key|PERMISSION_DENIED|401|403/.test(String(err))) break;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

const str = { type: Type.STRING };
const strArr = { type: Type.ARRAY, items: str };

const dealSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    deals: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          company: str,
          oneLiner: { type: Type.STRING, description: "What the company does, max 15 words" },
          sector: { type: Type.STRING, enum: [...SECTORS] },
          matchedFocusSectors: { ...strArr, description: "Subset of the investor's focus sectors this deal fits; [] if none" },
          stage: { type: Type.STRING, enum: [...STAGES] },
          amountUSDm: { type: Type.NUMBER, nullable: true, description: "Round size in USD millions; null if undisclosed" },
          amountText: { type: Type.STRING, description: "Amount as reported, e.g. 'Rs 142 Cr' or '$12M'" },
          leadInvestors: strArr,
          otherInvestors: strArr,
          city: str,
          articleIds: { type: Type.ARRAY, items: { type: Type.INTEGER } },
        },
        required: ["company", "oneLiner", "sector", "matchedFocusSectors", "stage", "amountUSDm", "amountText", "leadInvestors", "otherInvestors", "city", "articleIds"],
      },
    },
  },
  required: ["deals"],
};

export async function extractDeals(articles: Article[], cfg: PulseConfig): Promise<Deal[]> {
  const lines = articles
    .map((a) => `[${a.id}] (${a.source}, ${a.publishedAt.slice(0, 10)}) ${a.title}${a.snippet ? " — " + a.snippet.slice(0, 280) : ""}`)
    .join("\n");
  const prompt = `You are an analyst extracting startup funding deals from Indian startup news headlines.

Return one entry per DISTINCT funding round that was ANNOUNCED in these articles, where the company raising money is an Indian startup (HQ or founders' main operations in India).
Rules:
- Include equity rounds, venture debt and bridge rounds. Exclude IPOs, share-price news, acquisitions without a raise, government grants, fund launches by VCs, accelerator programmes, and non-Indian companies.
- "Funding wrap" / roundup articles may contain several deals: extract each one you can identify.
- If several articles describe the same round, return ONE entry listing all their ids in articleIds.
- Convert INR to USD at ₹88 = $1 (₹1 crore ≈ $0.114M). Use null when the amount is undisclosed.
- Stage: use the reported stage; if not reported, use "Undisclosed".
- matchedFocusSectors: choose only from this investor's focus list: ${JSON.stringify(cfg.focusSectors)}. Match semantically (e.g. a UPI lending app fits "Fintech").
- Never invent investors, amounts or cities; use "" or [] when unknown.

Articles:
${lines}`;
  const out = await generateJSON<{ deals: Deal[] }>(prompt, dealSchema, { fast: true });
  return out.deals ?? [];
}

const analysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: "One-sentence takeaway of the week, max 25 words" },
    summary: { type: Type.STRING, description: "3-4 sentence executive summary" },
    patterns: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { title: str, detail: str, companies: strArr }, required: ["title", "detail", "companies"] },
    },
    sectorMomentum: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { sector: str, trend: { type: Type.STRING, enum: ["heating", "steady", "cooling", "new"] }, note: str },
        required: ["sector", "trend", "note"],
      },
    },
    investorMoves: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { investor: str, note: str, companies: strArr }, required: ["investor", "note", "companies"] },
    },
    adjacencyAlerts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { watchlistCompany: str, dealCompany: str, reason: str },
        required: ["watchlistCompany", "dealCompany", "reason"],
      },
    },
    actionItems: strArr,
  },
  required: ["headline", "summary", "patterns", "sectorMomentum", "investorMoves", "adjacencyAlerts", "actionItems"],
};

export async function analyzeWeek(input: {
  cfg: PulseConfig;
  deals: unknown[];
  stats: unknown;
  watchlistHits: unknown[];
  newInvestors: unknown[];
  hasHistory: boolean;
}): Promise<Analysis> {
  const { cfg } = input;
  const prompt = `You are a senior venture analyst writing the Monday-morning funding brief for ${cfg.ownerName}, a venture scout at a Bengaluru family office backing early-stage Indian startups.

Mandate:
- Focus sectors: ${cfg.focusSectors.join(", ") || "(none set)"}
- Focus stages: ${cfg.focusStages.join(", ") || "(none set)"}
- Watchlist (portfolio and tracked companies, with notes): ${JSON.stringify(cfg.watchlist)}

Last week's Indian startup deals (already extracted and ranked; tier "priority" = matches both sector and stage focus):
${JSON.stringify(input.deals)}

Computed statistics (prevDeals = deal count in the previous weekly brief, null if no history):
${JSON.stringify(input.stats)}

Direct watchlist hits: ${JSON.stringify(input.watchlistHits)}
Investors seen in a sector for the first time in our history: ${input.hasHistory ? JSON.stringify(input.newInvestors) : "(first brief — no history yet; treat this week as the baseline)"}

Write the brief. Requirements:
- Signal, not noise. Every claim must be grounded in the deals above; cite company names. Do not invent deals.
- patterns: 3-5 non-obvious patterns across the week's deal flow (sector clusters, stage shifts, ticket sizes, repeat investors, geography, themes like AI-first or B2B infra). Prioritise patterns relevant to the mandate.
- sectorMomentum: for each focus sector plus any sector with unusual activity, say heating / steady / cooling vs the previous week (use "new" when there is no history), with a short reason grounded in counts and amounts.
- investorMoves: notable investors — those leading multiple rounds, entering a focus sector for the first time, or making unusually large bets. Max 6.
- adjacencyAlerts: deals by companies that compete with, or sit right next to, a watchlist company (same customer, same category, or a likely competitor). This matters most: ${cfg.ownerName} must never again learn about a competitor's raise in a board meeting. Return [] if nothing is genuinely adjacent.
- actionItems: 3-5 concrete things to do this week (founders to reach out to, portfolio companies to flag, LP talking points).`;
  return generateJSON<Analysis>(prompt, analysisSchema);
}
