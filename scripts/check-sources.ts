import { collectArticles } from "../lib/sources.ts";
const since = new Date(Date.now() - 7 * 864e5);
const { articles, sources } = await collectArticles(["B2B SaaS", "Climate Tech & EV", "AI / Deep Tech"], since);
console.table(sources);
console.log(articles.length, "articles");
for (const a of articles.slice(0, 15)) console.log(`- [${a.source}] ${a.title}`);
