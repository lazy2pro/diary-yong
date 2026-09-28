import OpenAI from "openai";
import type { AiProvider, ChatMessage } from "./types";

// 대화를 다이어리 글로 정리하는 시스템 프롬프트.
// 따뜻한 1인칭 일기체로, 사용자가 말한 내용만 근거로 자연스럽게 써 내려간다.
const DIARY_SYSTEM = `너는 사용자의 하루 이야기를 함께 정리해 주는 다정한 일기 친구야.
- 사용자가 편하게 오늘 있었던 일을 이야기하면, 공감하며 짧게 되물어 이야기를 이끌어 줘.
- 한국어로, 따뜻하고 담백한 말투로 대화해. 답장은 2~4문장으로 짧게.
- 사용자가 하지 않은 사실을 지어내지 마.`;

// 대화 내용을 바탕으로 완성된 일기 본문(1인칭)과 제목을 JSON으로 생성하도록 하는 프롬프트
const COMPOSE_SYSTEM = `너는 사용자의 대화를 바탕으로 하루의 일기를 완성하는 작가야.
지금까지의 대화를 근거로, 사용자의 시점(1인칭 '나')에서 자연스러운 일기 한 편을 써.
규칙:
- 한국어. 따뜻하고 진솔한 일기체.
- 대화에 나온 내용만 사용. 없는 사실은 지어내지 마.
- 3~6문단, 각 문단은 짧게.
반드시 아래 JSON 형식으로만 답해:
{"title":"짧고 감성적인 제목","body":"일기 본문(줄바꿈은 \\n)","mood":"오늘 기분을 나타내는 이모지 1개"}`;

function toOpenAiMessages(chat: ChatMessage[]) {
  return chat.map((m) => ({ role: m.role, content: m.content }));
}

// Gemini REST 호출 (SDK 없이 fetch로)
async function geminiGenerate(system: string, chat: ChatMessage[], jsonMode: boolean): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY가 설정되어 있지 않아요.");
  const model = "gemini-2.0-flash";
  const contents = chat.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: jsonMode ? { responseMimeType: "application/json" } : {},
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini 오류 (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((pt: { text?: string }) => pt.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini가 빈 응답을 반환했어요.");
  return text;
}

async function openaiGenerate(system: string, chat: ChatMessage[], jsonMode: boolean): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되어 있지 않아요.");
  const client = new OpenAI({ apiKey: key });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: system }, ...toOpenAiMessages(chat)],
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    temperature: 0.8,
  });
  const text = completion.choices[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenAI가 빈 응답을 반환했어요.");
  return text;
}

// 대화 중 AI의 다음 답장 (일기 친구로서 되묻기/공감)
export async function chatReply(provider: AiProvider, chat: ChatMessage[]): Promise<string> {
  return provider === "gemini"
    ? geminiGenerate(DIARY_SYSTEM, chat, false)
    : openaiGenerate(DIARY_SYSTEM, chat, false);
}

export interface ComposedDiary {
  title: string;
  body: string;
  mood: string | null;
}

// 대화 전체를 하나의 완성된 일기로 정리
export async function composeDiary(provider: AiProvider, chat: ChatMessage[]): Promise<ComposedDiary> {
  const instruction: ChatMessage = {
    role: "user",
    content: "위 대화를 바탕으로 오늘의 일기를 완성해서 JSON으로 줘.",
  };
  const raw =
    provider === "gemini"
      ? await geminiGenerate(COMPOSE_SYSTEM, [...chat, instruction], true)
      : await openaiGenerate(COMPOSE_SYSTEM, [...chat, instruction], true);
  try {
    const parsed = JSON.parse(raw);
    return {
      title: String(parsed.title ?? "제목 없는 하루").slice(0, 80),
      body: String(parsed.body ?? ""),
      mood: parsed.mood ? String(parsed.mood).slice(0, 4) : null,
    };
  } catch {
    // JSON 파싱 실패 시 본문만이라도 살린다
    return { title: "오늘의 일기", body: raw, mood: null };
  }
}
