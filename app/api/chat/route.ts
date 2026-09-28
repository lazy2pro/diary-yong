import { NextRequest, NextResponse } from "next/server";
import { errMsg } from "@/lib/util";
import { chatReply } from "@/lib/ai";
import type { AiProvider, ChatMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

// 대화 중 AI의 다음 답장을 돌려준다.
// body: { provider: 'openai'|'gemini', messages: ChatMessage[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const provider: AiProvider = body?.provider === "gemini" ? "gemini" : "openai";
    const messages: ChatMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      return NextResponse.json({ error: "메시지가 비어 있어요." }, { status: 400 });
    }
    const reply = await chatReply(provider, messages);
    return NextResponse.json({ reply });
  } catch (error: unknown) {
    return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  }
}
