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
  if (!key) throw new Error("GEMINI_API_KEY가 설정되어 있지 않아요. Vercel 환경변수에 키를 추가한 뒤 재배포해 주세요.");
  // 모델 버전은 자주 바뀌므로 환경변수(GEMINI_MODEL)로 덮어쓸 수 있게 한다. 기본은 최신 GA 모델.
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const contents = chat.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  // 속도 최적화: Gemini 3.x는 기본으로 긴 "사고(thinking)"를 하는데, 캐주얼한 일기 대화엔
  // 불필요해 응답이 느려진다. thinkingBudget=0으로 사고를 끄고, 답변 길이도 제한한다.
  // (일기 완성처럼 정리가 필요한 jsonMode에서는 사고를 살짝 허용한다.)
  // jsonMode(일기 완성)에서는 "사고" 토큰이 출력 예산을 잠식해 JSON이 잘려(MAX_TOKENS) 파싱 실패가
  // 났다. 출력 예산을 넉넉히(2048) 주고, 사고 예산은 그보다 작게 둬서 JSON 본문이 잘리지 않게 한다.
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: jsonMode ? 2048 : 320,
    thinkingConfig: { thinkingBudget: jsonMode ? 256 : 0 },
  };
  if (jsonMode) generationConfig.responseMimeType = "application/json";
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig,
  });

  // 일시적 과부하(503/500/429)는 잠깐 기다렸다 자동 재시도한다.
  const RETRY_STATUS = new Set([429, 500, 503]);
  const maxAttempts = 3;
  let res: Response | null = null;
  let lastDetail = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: payload,
    });
    if (res.ok) break;
    lastDetail = await res.text();
    if (RETRY_STATUS.has(res.status) && attempt < maxAttempts) {
      // 지수 백오프: 0.8s, 1.6s
      await new Promise((r) => setTimeout(r, 800 * attempt));
      continue;
    }
    break;
  }

  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    if (status === 400 && /API key not valid/i.test(lastDetail))
      throw new Error("Gemini 키가 올바르지 않아요. GEMINI_API_KEY 값을 확인해 주세요.");
    if (status === 404)
      throw new Error(`Gemini 모델(${model})을 찾을 수 없어요. GEMINI_MODEL 환경변수로 사용 가능한 모델명을 지정해 주세요.`);
    if (status === 429) throw new Error("Gemini 사용 한도를 초과했어요. 잠시 후 다시 시도해 주세요.");
    if (status === 503 || status === 500)
      throw new Error("지금 Gemini가 혼잡해요. 잠시 후 다시 시도하거나, 상단에서 GPT로 바꿔서 이어가 보세요.");
    throw new Error(`Gemini 오류 (${status}): ${lastDetail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((pt: { text?: string }) => pt.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini가 빈 응답을 반환했어요.");
  return text;
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

async function openaiGenerate(system: string, chat: ChatMessage[], jsonMode: boolean): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되어 있지 않아요. Vercel 환경변수에 키를 추가한 뒤 재배포해 주세요.");
  const client = new OpenAI({ apiKey: key });
  try {
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: "system", content: system }, ...toOpenAiMessages(chat)],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      temperature: 0.8,
    });
    const text = completion.choices[0]?.message?.content ?? "";
    if (!text) throw new Error("OpenAI가 빈 응답을 반환했어요.");
    return text;
  } catch (e: unknown) {
    // OpenAI SDK 오류를 사용자가 이해할 수 있는 한국어 메시지로 변환
    const err = e as { status?: number; code?: string; message?: string };
    const status = err?.status;
    if (status === 401) throw new Error("OpenAI 키가 올바르지 않아요. OPENAI_API_KEY 값을 확인해 주세요.");
    if (status === 429 || err?.code === "insufficient_quota")
      throw new Error("OpenAI 사용 한도/크레딧이 부족해요. platform.openai.com의 Billing에서 결제·크레딧을 확인해 주세요. (ChatGPT Plus 구독과 API 사용료는 별개예요)");
    if (status === 404) throw new Error(`OpenAI 모델(${OPENAI_MODEL})에 접근할 수 없어요. 계정에서 사용 가능한 모델인지 확인해 주세요.`);
    throw new Error(`OpenAI 오류: ${err?.message ?? String(e)}`);
  }
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
  const parsed = parseDiaryJson(raw);
  if (parsed) {
    return {
      title: String(parsed.title ?? "제목 없는 하루").slice(0, 80),
      body: String(parsed.body ?? ""),
      mood: parsed.mood ? String(parsed.mood).slice(0, 4) : null,
    };
  }
  // JSON 파싱이 끝내 실패하면(형식 이탈 등) 원문에서 코드펜스만 걷어내 본문으로 살린다.
  return { title: "오늘의 일기", body: raw.replace(/```(?:json)?/gi, "").trim(), mood: null };
}

// 모델이 마크다운 코드펜스(```json ... ```)로 감싸거나 앞뒤에 설명을 붙이거나,
// 토큰 제한으로 뒷부분이 살짝 잘려도 최대한 JSON 객체를 복구해서 파싱한다.
function parseDiaryJson(raw: string): { title?: unknown; body?: unknown; mood?: unknown } | null {
  if (!raw) return null;
  // 1) 코드펜스 제거
  let s = raw.replace(/```(?:json)?/gi, "").trim();
  // 2) 그대로 시도
  try {
    return JSON.parse(s);
  } catch {
    /* 계속 */
  }
  // 3) 첫 '{'부터 마지막 '}'까지 잘라서 시도
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) {
    const slice = s.slice(first, last + 1);
    try {
      return JSON.parse(slice);
    } catch {
      /* 계속 */
    }
  }
  // 4) 잘린 경우: 필드 값만 정규식으로 추출
  const grab = (key: string) => {
    const m = s.match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
    if (!m) return undefined;
    try {
      return JSON.parse('"' + m[1] + '"');
    } catch {
      return m[1];
    }
  };
  const title = grab("title");
  const body = grab("body");
  const mood = grab("mood");
  if (title != null || body != null) {
    return { title, body, mood };
  }
  return null;
}
