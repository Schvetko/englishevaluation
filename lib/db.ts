import { Redis } from "@upstash/redis";
import type { AssessmentRecord } from "./types";

const INDEX_KEY = "assessments:index";

export function getRedis(): Redis | null {
  // Vercel KV / Upstash Marketplace integrations expose either naming scheme.
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function saveAssessment(record: AssessmentRecord): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    throw new Error(
      "Database is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN (Upstash Redis via Vercel Marketplace).",
    );
  }
  await redis.set(`assessment:${record.id}`, JSON.stringify(record));
  await redis.zadd(INDEX_KEY, {
    score: Date.parse(record.createdAt),
    member: record.id,
  });
}

export async function getAssessment(
  id: string,
): Promise<AssessmentRecord | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get<AssessmentRecord | string>(`assessment:${id}`);
  if (!raw) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as AssessmentRecord) : raw;
}

export async function setPronunciationScore(
  id: string,
  score: 1 | 2 | 3 | 4 | 5 | null,
): Promise<AssessmentRecord | null> {
  const record = await getAssessment(id);
  if (!record) return null;
  const updated: AssessmentRecord = { ...record, pronunciationScore: score };
  await saveAssessment(updated);
  return updated;
}

export async function listAssessments(): Promise<AssessmentRecord[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true });
  if (!ids.length) return [];
  const keys = ids.map((id) => `assessment:${id}`);
  const rows = await redis.mget<(AssessmentRecord | string | null)[]>(...keys);
  return rows
    .filter((r): r is AssessmentRecord | string => r !== null)
    .map((r) => (typeof r === "string" ? (JSON.parse(r) as AssessmentRecord) : r));
}
