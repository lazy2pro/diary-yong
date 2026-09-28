import { NextRequest, NextResponse } from "next/server";
import { errMsg } from "@/lib/util";
import { listEntries, saveEntry, newEntry } from "@/lib/store";
import { composeDiary } from "@/lib/ai";
import type { AiProvider, ChatMessage, DiaryEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

// 목록 조회
export async function GET() {
  try {
    return NextResponse.json({ entries: await listEntries() });
  } catch (error: unknown) {
    return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  }
}

// 새 일기 생성.
// body: { provider, chat: ChatMessage[], title?, body?, mood? }
// chat이 있으면 AI가 대화를 정리해 일기 본문을 완성한다. title/body가 직접 오면 그대로 저장.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const provider: AiProvider = b?.provider === "gemini" ? "gemini" : "openai";
    const chat: ChatMessage[] = Array.isArray(b?.chat) ? b.chat : [];

    const entry: DiaryEntry = newEntry();
    entry.chat = chat;

    if (b?.body && String(b.body).trim()) {
      entry.title = String(b.title ?? "").slice(0, 80) || "오늘의 일기";
      entry.body = String(b.body);
      entry.mood = b?.mood ? String(b.mood).slice(0, 4) : null;
    } else if (chat.length > 0) {
      const composed = await composeDiary(provider, chat);
      entry.title = composed.title;
      entry.body = composed.body;
      entry.mood = composed.mood;
    } else {
      return NextResponse.json({ error: "대화 내용이나 본문이 필요해요." }, { status: 400 });
    }

    await saveEntry(entry);
    return NextResponse.json({ entry });
  } catch (error: unknown) {
    return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  }
}
