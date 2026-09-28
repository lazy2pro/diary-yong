import { NextRequest, NextResponse } from "next/server";
import { errMsg } from "@/lib/util";
import { listEntries, saveEntry, newEntry, getEntry } from "@/lib/store";
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

// 새 일기 생성 / 임시 일기(draft) 생성 / 기존 일기에 대화 정리.
// body:
//  - { draft: true }                 → 빈 임시 일기를 만들어 id 발급 (쓰기 중 사진 첨부용)
//  - { id, provider, chat }           → 기존 일기(id)에 대화를 정리해 본문 채우기
//  - { provider, chat }               → 새 일기를 만들고 대화를 정리
//  - { title, body, mood }            → 직접 입력한 본문으로 저장
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const provider: AiProvider = b?.provider === "gemini" ? "gemini" : "openai";
    const chat: ChatMessage[] = Array.isArray(b?.chat) ? b.chat : [];

    // 1) 임시 일기(draft) 발급: 사진을 붙일 대상 id만 먼저 만든다
    if (b?.draft === true) {
      const draft = newEntry();
      draft.title = "작성 중인 일기";
      await saveEntry(draft);
      return NextResponse.json({ entry: draft });
    }

    // 2) 기존 일기에 이어 쓰기(사진을 먼저 붙여둔 draft를 완성)
    const existing = b?.id ? await getEntry(String(b.id)) : null;
    const entry: DiaryEntry = existing ?? newEntry();
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
