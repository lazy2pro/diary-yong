import { Redis } from "@upstash/redis";
import type { DiaryEntry, DiaryEntrySummary } from "./types";

// Vercel의 KV(=Upstash Redis) 통합이 주입하는 환경변수를 사용.
// KV_REST_API_URL / KV_REST_API_TOKEN (Vercel KV) 또는
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash 직접 연결) 둘 다 지원.
const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? "",
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
});

// 저장 구조:
// - 'diary:entries' (sorted set): score=createdAt, member=entryId  → 시간순 목록
// - 'diary:entry:<id>' (string, JSON): 개별 일기 전체 데이터
const INDEX_KEY = "diary:entries";
const entryKey = (id: string) => `diary:entry:${id}`;

export function dateKeyKST(ms: number): string {
  return new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

function summarize(e: DiaryEntry): DiaryEntrySummary {
  const preview = (e.body || "").replace(/\s+/g, " ").trim().slice(0, 90);
  return {
    id: e.id,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    dateKey: e.dateKey,
    title: e.title,
    mood: e.mood,
    photoCount: e.photos.length,
    preview,
  };
}

export async function listEntries(): Promise<DiaryEntrySummary[]> {
  // 최신순
  const ids = await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true });
  if (!ids || ids.length === 0) return [];
  const raw = await Promise.all(ids.map((id) => redis.get<DiaryEntry>(entryKey(id))));
  return raw.filter((e): e is DiaryEntry => !!e).map(summarize);
}

export async function getEntry(id: string): Promise<DiaryEntry | null> {
  return (await redis.get<DiaryEntry>(entryKey(id))) ?? null;
}

export async function saveEntry(entry: DiaryEntry): Promise<DiaryEntry> {
  entry.updatedAt = Date.now();
  await redis.set(entryKey(entry.id), entry);
  await redis.zadd(INDEX_KEY, { score: entry.createdAt, member: entry.id });
  return entry;
}

export async function deleteEntry(id: string): Promise<void> {
  await redis.del(entryKey(id));
  await redis.zrem(INDEX_KEY, id);
}

export function newEntry(): DiaryEntry {
  const now = Date.now();
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    dateKey: dateKeyKST(now),
    title: "",
    body: "",
    mood: null,
    chat: [],
    photos: [],
  };
}
