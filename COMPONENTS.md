# Components Map: Startup Funding Pulse

```mermaid
flowchart LR
  subgraph Trigger
    CRON["Vercel Cron<br/>Mon 00:30 UTC = 06:00 IST<br/>/api/cron"]
    BTN["Dashboard button<br/>/api/generate"]
  end

  subgraph Sources["Live data (RSS, no keys)"]
    S1[Inc42 Buzz]
    S2[YourStory]
    S3[ET Tech Funding]
    S4["Google News queries<br/>(Entrackr, Moneycontrol, VCCircle,<br/>press wires, etc.)"]
    S5["Per-sector Google News queries<br/>(from Aarav's config)"]
  end

  subgraph Pipeline["lib/brief.ts: generateBrief()"]
    C[collectArticles<br/>lib/sources.ts<br/>7-day window · keyword filter · dedupe]
    E["extractDeals ×N batches<br/>Gemini Flash · JSON schema<br/>lib/gemini.ts"]
    M[mergeDeals<br/>cross-source dedupe]
    R["rank()<br/>sector + stage + watchlist scoring<br/>→ priority / focus / other"]
    ST["computeStats<br/>week-over-week by sector"]
    INV[Investor history<br/>first-time-in-sector detection]
    A["analyzeWeek<br/>Gemini Flash<br/>patterns · momentum · investor moves<br/>adjacency alerts · actions"]
  end

  subgraph Store["Upstash Redis (lib/store.ts)"]
    K1[(pulse:config)]
    K2[(pulse:brief:latest / :date)]
    K3[(pulse:history)]
    K4[(pulse:investors)]
  end

  subgraph Delivery
    EM["Resend email<br/>lib/email.ts"]
    WEB["Dashboard /<br/>app/page.tsx"]
    CFG["Config editor /config<br/>app/config/page.tsx"]
  end

  CRON --> C
  BTN --> C
  S1 & S2 & S3 & S4 & S5 --> C
  K1 --> C
  C --> E --> M --> R --> ST --> INV --> A
  K3 --> ST
  K4 <--> INV
  A --> K2
  K2 --> WEB
  A --> EM
  CFG <-->|/api/config · ADMIN_KEY| K1
```

| Component | File | Role |
|---|---|---|
| Source collector | `lib/sources.ts` | Fetches 8 fixed feeds plus up to 6 sector-specific Google News feeds built from the config. Keeps the last 7 days, filters for funding language, drops IPO and stock noise, and dedupes headlines. |
| Deal extractor (AI) | `lib/gemini.ts` → `extractDeals` | Gemini Flash with a strict JSON schema turns headlines into structured deals: company, sector (fixed taxonomy), stage, USD amount, investors, city, and which of Aarav's focus sectors the deal semantically matches. |
| Ranker | `lib/brief.ts` → `rank` | Deterministic scoring: watchlist +100, focus sector +40, focus stage +30, plus amount and source-count bonuses. Puts each deal in the priority, focus or other tier and detects watchlist companies that raised or were mentioned. |
| Stats + history | `lib/brief.ts` | Sector and stage counts, comparison with last week's brief, and investors appearing in a sector for the first time. |
| Analyst (AI) | `lib/gemini.ts` → `analyzeWeek` | Gemini Flash writes the headline, summary, cross-deal patterns, sector momentum, investor moves, **adjacency alerts** (competitors of watchlist companies) and action items. |
| Model fallback | `lib/gemini.ts` | Chain of Flash models (3.5 → 3.6 → 3-preview → flash-latest → 3.7 → flash-lite). On 503 (overloaded) or 429 (quota) it switches immediately and remembers the model that worked. Each call has a 60 s timeout and a 110 s budget. If the analysis step still fails, the brief is published with a rule-based summary instead of failing. |
| Storage | `lib/store.ts` | Upstash Redis holds the config, briefs, history and investor memory. Falls back to in-memory storage if Redis isn't connected. |
| Delivery | `lib/email.ts`, `app/page.tsx` | HTML email through Resend, and the web dashboard with an archive of past briefs. |
| Config | `app/config/page.tsx`, `app/api/config` | Aarav edits sectors, stages, watchlist (with notes) and recipient email himself. Writes are protected by `ADMIN_KEY`. |
| Scheduler | `vercel.json`, `app/api/cron` | Weekly Vercel Cron, authenticated with `CRON_SECRET`. |
