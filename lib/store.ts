import { Redis } from "@upstash/redis";

// Works with both the Upstash integration and legacy Vercel KV env names.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

// Fallback so the app still runs without a database (data lost on cold start).
const g = globalThis as unknown as { __pulseMem?: Map<string, unknown> };
const mem = (g.__pulseMem ??= new Map());

export const storageMode: "redis" | "memory" = redis ? "redis" : "memory";

export async function getJSON<T>(key: string): Promise<T | null> {
  if (redis) return ((await redis.get<T>(key)) ?? null) as T | null;
  return (mem.get(key) as T) ?? null;
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  if (redis) await redis.set(key, value);
  else mem.set(key, value);
}

export const KEYS = {
  config: "pulse:config",
  latest: "pulse:brief:latest",
  brief: (id: string) => `pulse:brief:${id}`,
  history: "pulse:history",
  investors: "pulse:investors",
};
