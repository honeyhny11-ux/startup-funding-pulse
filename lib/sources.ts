import { XMLParser } from "fast-xml-parser";
import type { Article } from "./types";

interface Feed { name: string; url: string; fundingOnly: boolean }

const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:7d")}&hl=en-IN&gl=IN&ceid=IN:en`;

// Startup media + newswire feeds. Google News queries pull in coverage from
// Entrackr, Moneycontrol, VCCircle, Business Standard, press-release wires, etc.
export function feedsFor(focusSectors: string[]): Feed[] {
  const base: Feed[] = [
    { name: "Inc42", url: "https://inc42.com/buzz/feed/", fundingOnly: false },
    { name: "YourStory", url: "https://yourstory.com/feed", fundingOnly: false },
    { name: "ET Tech Funding", url: "https://economictimes.indiatimes.com/tech/funding/rssfeeds/78570540.cms", fundingOnly: true },
    { name: "Google News: funding", url: gnews("Indian startup raises funding"), fundingOnly: true },
    { name: "Google News: seed", url: gnews("India startup seed round raises"), fundingOnly: true },
    { name: "Google News: Series A/B", url: gnews('India startup "Series A" OR "Series B" OR "Series C" raises'), fundingOnly: true },
    { name: "Google News: funding wrap", url: gnews("funding wrap Indian startups this week"), fundingOnly: true },
    { name: "Google News: press releases", url: gnews("Bengaluru OR Mumbai OR Delhi startup announces funding led by"), fundingOnly: true },
  ];
  const sectorFeeds = focusSectors.slice(0, 6).map((s) => ({
    name: `Google News: ${s}`,
    // "&" and "/" break Google News queries; "Climate Tech & EV" -> "Climate Tech OR EV".
    url: gnews(`${s.replace(/\s*[&/]\s*/g, " OR ")} startup India raises funding`),
    fundingOnly: true,
  }));
  return [...base, ...sectorFeeds];
}

const FUNDING_RE =
  /\b(rais(e|es|ed|ing)|fund(ing|ed|raise)|seed|series [a-f]|pre-series|round|crore|cr\b|mn\b|million|bn\b|billion|investment|invests?|backed|led by|bags|secures|nets|garners|mops up|venture debt)\b/i;
const NOISE_RE = /\b(ipo listing|share price|stock (rises|falls)|sensex|nifty|quarterly results|q[1-4] results|layoffs?)\b/i;

const parser = new XMLParser({ ignoreAttributes: false, textNodeName: "#text" });

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as object)) return String((v as Record<string, unknown>)["#text"]);
  return "";
};

const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?38;/g, "&")
   .replace(/&#8217;|&rsquo;/g, "'").replace(/&#8216;|&lsquo;/g, "'").replace(/&#8220;|&#8221;|&quot;/g, '"')
   .replace(/&#8211;|&#8212;/g, "-").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();

async function fetchFeed(feed: Feed, since: Date) {
  const res = await fetch(feed.url, {
    headers: { "User-Agent": "Mozilla/5.0 (StartupFundingPulse/1.0)" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);
  const xml = parser.parse(await res.text());
  const raw = xml?.rss?.channel?.item ?? [];
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  const out: Omit<Article, "id">[] = [];
  for (const it of items as Record<string, unknown>[]) {
    let title = stripHtml(text(it.title));
    let source = feed.name;
    // Google News titles look like "Headline - Publisher"
    if (feed.url.includes("news.google.com")) {
      const pub = text(it.source);
      if (pub) {
        source = pub;
        const suffix = ` - ${pub}`;
        if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
      }
    }
    const date = new Date(text(it.pubDate));
    if (isNaN(date.getTime()) || date < since) continue;
    const snippet = feed.url.includes("news.google.com") ? "" : stripHtml(text(it.description)).slice(0, 400);
    if (!FUNDING_RE.test(title + " " + (feed.fundingOnly ? "" : snippet.slice(0, 150)))) continue;
    if (NOISE_RE.test(title)) continue;
    out.push({ title, snippet, url: text(it.link), source, publishedAt: date.toISOString() });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function collectArticles(focusSectors: string[], since: Date, max = 220) {
  const feeds = feedsFor(focusSectors);
  const results = await Promise.allSettled(feeds.map((f) => fetchFeed(f, since)));
  const seen = new Set<string>();
  const articles: Article[] = [];
  const sources: { name: string; articles: number; ok: boolean }[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      sources.push({ name: feeds[i].name, articles: 0, ok: false });
      return;
    }
    let added = 0;
    for (const a of r.value) {
      const key = norm(a.title).slice(0, 70);
      if (seen.has(key)) continue;
      seen.add(key);
      articles.push({ ...a, id: articles.length + 1 });
      added++;
    }
    sources.push({ name: feeds[i].name, articles: added, ok: true });
  });
  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const trimmed = articles.slice(0, max).map((a, i) => ({ ...a, id: i + 1 }));
  return { articles: trimmed, sources };
}
