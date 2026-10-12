import { getJSON, setJSON, KEYS } from "./store";
import { STAGES, type PulseConfig, type Stage } from "./types";

export const DEFAULT_CONFIG: PulseConfig = {
  ownerName: "Aarav",
  email: "",
  focusSectors: ["Fintech", "B2B SaaS", "Climate Tech & EV", "AI / Deep Tech", "HealthTech"],
  focusStages: ["Pre-Seed", "Seed", "Pre-Series A", "Series A"],
  watchlist: [
    { name: "Zepto", note: "quick commerce bellwether" },
    { name: "Razorpay", note: "payments infra; portfolio co. is adjacent" },
    { name: "Ather Energy", note: "EV two-wheeler" },
    { name: "Groww", note: "retail investing" },
    { name: "Sarvam AI", note: "Indic LLMs" },
  ],
};

export async function getConfig(): Promise<PulseConfig> {
  const saved = await getJSON<PulseConfig>(KEYS.config);
  return saved ? { ...DEFAULT_CONFIG, ...saved } : DEFAULT_CONFIG;
}

const clean = (xs: unknown) =>
  Array.isArray(xs) ? xs.map((x) => String(x).trim()).filter(Boolean).slice(0, 40) : [];

export function validateConfig(input: unknown): PulseConfig {
  const c = (input ?? {}) as Record<string, unknown>;
  const stages = clean(c.focusStages).filter((s): s is Stage => (STAGES as readonly string[]).includes(s));
  const watchlist = Array.isArray(c.watchlist)
    ? c.watchlist
        .map((w) => ({ name: String(w?.name ?? "").trim(), note: String(w?.note ?? "").trim() || undefined }))
        .filter((w) => w.name)
        .slice(0, 100)
    : [];
  return {
    ownerName: String(c.ownerName ?? "Aarav").trim().slice(0, 60) || "Aarav",
    email: String(c.email ?? "").trim().slice(0, 200),
    focusSectors: clean(c.focusSectors),
    focusStages: stages,
    watchlist,
  };
}

export async function saveConfig(cfg: PulseConfig) {
  await setJSON(KEYS.config, cfg);
}
