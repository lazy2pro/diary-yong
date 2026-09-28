"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AiProvider, ChatMessage, DiaryEntry, DiaryEntrySummary } from "@/lib/types";
import { errMsg } from "@/lib/util";

type View = "cover" | "shelf" | "write" | "read";

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" });
const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

// Web Speech API 최소 타입 (표준 TS 타입이 없어 필요한 부분만 정의)
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// 브라우저 내장 음성인식(Web Speech API)으로 말 → 텍스트. (별도 API 비용 없음)
function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) setFinalText(final.trim());
      setInterimText(interim);
    };
    rec.onend = () => {
      setListening(false);
      setInterimText("");
    };
    rec.onerror = () => {
      setListening(false);
      setInterimText("");
    };
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  const start = () => {
    if (!recRef.current || listening) return;
    setFinalText("");
    setInterimText("");
    try {
      recRef.current.start();
      setListening(true);
    } catch {
      /* 이미 실행 중 등 */
    }
  };
  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  };

  return { listening, finalText, interimText, supported, start, stop };
}

// 브라우저 내장 음성합성(Web Speech API)으로 텍스트 → 음성.
function speakText(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 1;
    u.pitch = 1.05;
    const koVoice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("ko"));
    if (koVoice) u.voice = koVoice;
    window.speechSynthesis.speak(u);
  } catch {
    /* noop */
  }
}

export default function Home() {
  const [view, setView] = useState<View>("cover");
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [entries, setEntries] = useState<DiaryEntrySummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [active, setActive] = useState<DiaryEntry | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("diary-provider") : null;
    if (saved === "openai" || saved === "gemini") setProvider(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("diary-provider", provider);
  }, [provider]);

  async function loadList() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/entries", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data.entries)) setEntries(data.entries);
    } catch {
      /* ignore */
    } finally {
      setLoadingList(false);
    }
  }

  function openShelf() {
    setView("shelf");
    loadList();
  }

  async function openEntry(id: string) {
    const res = await fetch(`/api/entries/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (data.entry) {
      setActive(data.entry);
      setView("read");
    }
  }

  return (
    <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <AnimatePresence mode="wait">
        {view === "cover" && <Cover key="cover" onOpen={openShelf} provider={provider} setProvider={setProvider} />}
        {view === "shelf" && (
          <Shelf
            key="shelf"
            entries={entries}
            loading={loadingList}
            onNew={() => setView("write")}
            onOpen={openEntry}
            onRefresh={loadList}
          />
        )}
        {view === "write" && (
          <WriteView
            key="write"
            provider={provider}
            setProvider={setProvider}
            onCancel={openShelf}
            onSaved={(e) => {
              setActive(e);
              setView("read");
            }}
          />
        )}
        {view === "read" && active && (
          <ReadView key={"read-" + active.id} entry={active} onBack={openShelf} onChange={setActive} />
        )}
      </AnimatePresence>
    </main>
  );
}

/* ---------- 표지: 다이어리를 펼치는 시작 화면 ---------- */
function Cover({ onOpen, provider, setProvider }: { onOpen: () => void; provider: AiProvider; setProvider: (p: AiProvider) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, rotateY: -80, transformPerspective: 1200 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ perspective: 1400 }}
    >
      <div
        style={{
          width: "min(360px, 86vw)",
          aspectRatio: "3 / 4",
          borderRadius: "10px 16px 16px 10px",
          background: "linear-gradient(135deg, var(--cover), var(--cover-dark))",
          boxShadow: "0 24px 50px rgba(60,40,20,0.45), inset 0 0 0 2px rgba(255,255,255,0.06)",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          color: "#f4e7d2",
          overflow: "hidden",
        }}
      >
        {/* 제본(왼쪽 띠) */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 22, background: "rgba(0,0,0,0.18)", boxShadow: "inset -3px 0 6px rgba(0,0,0,0.25)" }} />
        {/* 고무 밴드 */}
        <div style={{ position: "absolute", right: 26, top: 0, bottom: 0, width: 12, background: "linear-gradient(#d7b98a,#b8945f)", opacity: 0.85 }} />
        <div style={{ fontSize: 54, filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.3))" }}>📔</div>
        <div style={{ textAlign: "center", lineHeight: 1.3 }}>
          <div style={{ fontSize: 13, letterSpacing: 4, opacity: 0.8 }}>MY DAILY</div>
          <div className="handwriting" style={{ fontSize: 46, marginTop: 4 }}>Diary-yong</div>
          <div style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>대화하며 써 내려가는 나의 하루</div>
        </div>

        <div style={{ display: "flex", gap: 6, background: "rgba(0,0,0,0.2)", borderRadius: 999, padding: 4 }}>
          {(["openai", "gemini"] as AiProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 12.5,
                fontWeight: 700,
                background: provider === p ? "#f4e7d2" : "transparent",
                color: provider === p ? "var(--cover-dark)" : "#f4e7d2",
              }}
            >
              {p === "openai" ? "GPT" : "Gemini"}
            </button>
          ))}
        </div>

        <button
          onClick={onOpen}
          style={{
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: 12,
            padding: "12px 26px",
            fontSize: 16,
            fontWeight: 800,
            boxShadow: "0 4px 0 #a56a24",
          }}
        >
          다이어리 펼치기
        </button>
      </div>
    </motion.div>
  );
}

/* ---------- 책장(목록): 한 장씩 넘겨보는 페이지들 ---------- */
function Shelf({
  entries,
  loading,
  onNew,
  onOpen,
  onRefresh,
}: {
  entries: DiaryEntrySummary[];
  loading: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, rotateY: 80, transformPerspective: 1200 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ width: "min(560px, 94vw)" }}
    >
      <div style={pageStyle()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="handwriting" style={{ fontSize: 30, color: "var(--cover-dark)" }}>나의 일기장</div>
          <button onClick={onRefresh} title="새로고침" style={ghostBtn()}>↻</button>
        </div>

        {loading ? (
          <div style={{ color: "var(--ink-soft)", padding: "40px 0", textAlign: "center" }}>펼치는 중...</div>
        ) : entries.length === 0 ? (
          <div style={{ color: "var(--ink-soft)", padding: "36px 8px", textAlign: "center", lineHeight: 1.7 }}>
            아직 쓴 일기가 없어요.<br />오늘의 이야기를 들려주세요.
          </div>
        ) : (
          <div className="no-scrollbar" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "56vh", overflowY: "auto", paddingRight: 2 }}>
            {entries.map((e, i) => (
              <motion.button
                key={e.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => onOpen(e.id)}
                style={entryCard()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>
                    {e.mood ? e.mood + " " : ""}{e.title || "제목 없는 하루"}
                  </span>
                  {e.photoCount > 0 && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>📷 {e.photoCount}</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>{fmtDate(e.createdAt)}</div>
                {e.preview && <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.5 }}>{e.preview}…</div>}
              </motion.button>
            ))}
          </div>
        )}

        <button onClick={onNew} style={{ ...primaryBtn(), width: "100%", marginTop: 16 }}>
          ✍️ 새 일기 쓰기
        </button>
      </div>
    </motion.div>
  );
}

/* ---------- 쓰기: AI와 대화 → 일기로 정리 ---------- */
function WriteView({
  provider,
  setProvider,
  onCancel,
  onSaved,
}: {
  provider: AiProvider;
  setProvider: (p: AiProvider) => void;
  onCancel: () => void;
  onSaved: (e: DiaryEntry) => void;
}) {
  const [chat, setChat] = useState<ChatMessage[]>([
    { role: "assistant", content: "안녕! 오늘 하루는 어땠어? 편하게 이야기해 줘. 내가 예쁜 일기로 정리해 줄게." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);
  const [err, setErr] = useState("");
  const [voiceMode, setVoiceMode] = useState(false); // AI 답장을 음성으로 읽어줄지
  const [draftId, setDraftId] = useState<string | null>(null); // 사진을 붙일 임시 일기 id
  const [photos, setPhotos] = useState<DiaryEntry["photos"]>([]); // 대화 중 첨부한 사진들
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput();

  // 사진을 저장하려면 서버에 일기 id가 있어야 한다. 없으면 임시 일기를 먼저 만든다.
  async function ensureDraftId(): Promise<string | null> {
    if (draftId) return draftId;
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: true }),
      });
      const data = await res.json();
      if (data?.entry?.id) {
        setDraftId(data.entry.id);
        return data.entry.id;
      }
      setErr(data.error ?? "임시 일기를 만들지 못했어요.");
      return null;
    } catch (e: unknown) {
      setErr(errMsg(e));
      return null;
    }
  }

  async function addPhoto(file: File) {
    setUploadingPhoto(true);
    setErr("");
    try {
      const id = await ensureDraftId();
      if (!id) return;
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/entries/${id}/photo`, { method: "POST", body: form });
      const data = await res.json();
      if (data.error) setErr(data.error);
      else if (data.entry) setPhotos(data.entry.photos);
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setUploadingPhoto(false);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, busy]);

  // 음성 인식 결과가 확정되면 입력창에 채운다
  useEffect(() => {
    if (voice.finalText) setInput((prev) => (prev ? prev + " " : "") + voice.finalText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.finalText]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...chat, { role: "user" as const, content: text }];
    setChat(next);
    setInput("");
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, messages: next }),
      });
      const data = await res.json();
      if (data.error) setErr(data.error);
      else {
        setChat((c) => [...c, { role: "assistant", content: data.reply }]);
        if (voiceMode) speakText(data.reply);
      }
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    const userTurns = chat.filter((m) => m.role === "user");
    if (userTurns.length === 0) {
      setErr("먼저 오늘 이야기를 한 마디라도 들려주세요.");
      return;
    }
    setComposing(true);
    setErr("");
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 대화 중 사진을 붙였다면 그 임시 일기(draftId)에 이어서 완성한다.
        body: JSON.stringify({ provider, chat, id: draftId }),
      });
      const data = await res.json();
      if (data.error) setErr(data.error);
      else onSaved(data.entry);
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setComposing(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, rotateY: 80, transformPerspective: 1200 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      style={{ width: "min(560px, 94vw)" }}
    >
      <div style={{ ...pageStyle(), display: "flex", flexDirection: "column", height: "min(78vh, 720px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
          <button onClick={onCancel} style={ghostBtn()}>← 목록</button>
          <span className="handwriting" style={{ fontSize: 22, color: "var(--cover-dark)" }}>오늘의 대화</span>
          {/* GPT ↔ Gemini 전환 */}
          <div style={{ display: "flex", gap: 3, background: "var(--paper-line)", borderRadius: 999, padding: 3 }}>
            {(["openai", "gemini"] as AiProvider[]).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 11.5,
                  fontWeight: 700,
                  background: provider === p ? "var(--accent)" : "transparent",
                  color: provider === p ? "#fff" : "var(--ink-soft)",
                }}
              >
                {p === "openai" ? "GPT" : "Gemini"}
              </button>
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="no-scrollbar" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "6px 2px" }}>
          {chat.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%" }}>
              <div
                style={{
                  padding: "10px 13px",
                  borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: m.role === "user" ? "var(--accent-soft)" : "#fff",
                  border: "1px solid var(--paper-line)",
                  color: "var(--ink)",
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && <div style={{ alignSelf: "flex-start", color: "var(--ink-soft)", fontSize: 13, padding: "4px 6px" }}>쓰는 중…</div>}
        </div>

        {err && <div style={{ color: "#c0392b", fontSize: 12.5, padding: "6px 2px" }}>{err}</div>}

        {/* 음성 안내 (인식 지원 여부) */}
        {voice.listening && (
          <div style={{ color: "var(--accent)", fontSize: 12.5, padding: "4px 2px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e0533d", animation: "none" }} /> 듣는 중… {voice.interimText}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "flex-end" }}>
          {voice.supported && (
            <button
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              title={voice.listening ? "녹음 중지" : "음성으로 말하기"}
              aria-label="음성 입력"
              style={{
                border: "none",
                width: 46,
                height: 46,
                borderRadius: 14,
                flexShrink: 0,
                background: voice.listening ? "#e0533d" : "var(--accent-soft)",
                color: voice.listening ? "#fff" : "var(--cover-dark)",
                fontSize: 20,
              }}
            >
              {voice.listening ? "■" : "🎙️"}
            </button>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={voice.supported ? "말하거나 입력해 주세요…" : "오늘 있었던 일을 이야기해 주세요…"}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "1px solid var(--paper-line)",
              borderRadius: 12,
              padding: "11px 13px",
              fontSize: 14,
              background: "#fff",
              color: "var(--ink)",
              outline: "none",
              maxHeight: 100,
            }}
          />
          <button onClick={send} disabled={busy || !input.trim()} style={{ ...primaryBtn(), padding: "0 16px", height: 46, opacity: busy || !input.trim() ? 0.5 : 1 }}>
            보내기
          </button>
        </div>

        {/* 대화 중 첨부한 사진 미리보기 */}
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={p.url}
                alt="첨부 사진"
                style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 10, border: "1px solid var(--paper-line)" }}
              />
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          {/* AI 답장 음성 읽기 토글 */}
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--ink-soft)", cursor: "pointer" }}>
            <input type="checkbox" checked={voiceMode} onChange={(e) => setVoiceMode(e.target.checked)} />
            🔊 답장을 목소리로 읽어주기
          </label>
          {/* 대화 중 사진 첨부 */}
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addPhoto(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => photoRef.current?.click()}
            disabled={uploadingPhoto}
            style={{ ...ghostBtn(), fontSize: 12.5, opacity: uploadingPhoto ? 0.6 : 1 }}
          >
            {uploadingPhoto ? "사진 올리는 중…" : "📷 사진 추가"}
          </button>
        </div>

        <button onClick={finish} disabled={composing} style={{ ...secondaryBtn(), width: "100%", marginTop: 10, opacity: composing ? 0.6 : 1 }}>
          {composing ? "일기로 정리하는 중…" : "📖 이 대화로 일기 완성하기"}
        </button>
      </div>
    </motion.div>
  );
}

/* ---------- 읽기/보기: 완성된 일기 페이지 + 사진 첨부 ---------- */
function ReadView({ entry, onBack, onChange }: { entry: DiaryEntry; onBack: () => void; onChange: (e: DiaryEntry) => void }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadPhoto(file: File) {
    setUploading(true);
    setErr("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/entries/${entry.id}/photo`, { method: "POST", body: form });
      const data = await res.json();
      if (data.error) setErr(data.error);
      else onChange(data.entry);
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, rotateY: 80, transformPerspective: 1200 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      style={{ width: "min(560px, 94vw)" }}
    >
      <div style={{ ...pageStyle(), maxHeight: "82vh", overflowY: "auto" }} className="no-scrollbar">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button onClick={onBack} style={ghostBtn()}>← 목록</button>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{fmtDate(entry.createdAt)}</span>
        </div>

        <h1 className="handwriting" style={{ fontSize: 32, color: "var(--cover-dark)", margin: "4px 0 14px", lineHeight: 1.2 }}>
          {entry.mood ? entry.mood + " " : ""}{entry.title}
        </h1>

        <div className="paper-lines" style={{ padding: "6px 2px 12px", fontSize: 15.5, lineHeight: "34px", whiteSpace: "pre-wrap", color: "var(--ink)" }}>
          {entry.body}
        </div>

        {/* 사진 갤러리 */}
        {entry.photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
            {entry.photos.map((p, i) => (
              <figure key={i} style={{ margin: 0, background: "#fff", border: "1px solid var(--paper-line)", borderRadius: 12, overflow: "hidden", boxShadow: "0 3px 8px rgba(0,0,0,0.08)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="일기 사진" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                <figcaption style={{ padding: "7px 9px", fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                  <div>🕒 {fmtDateTime(p.takenAt ?? p.addedAt)}{p.takenAt == null && " (업로드)"}</div>
                  <div>📍 {p.place ?? (p.lat != null ? `${p.lat.toFixed(4)}, ${p.lng!.toFixed(4)}` : "위치 정보 없음")}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        {err && <div style={{ color: "#c0392b", fontSize: 12.5, marginTop: 10 }}>{err}</div>}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhoto(f);
            e.target.value = "";
          }}
        />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...secondaryBtn(), width: "100%", marginTop: 16, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? "사진 올리는 중…" : "📷 사진 추가하기"}
        </button>
        <p style={{ fontSize: 11, color: "var(--ink-soft)", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
          사진에 위치 정보(GPS)가 담겨 있으면 찍은 장소와 시간이 함께 기록돼요.
        </p>
      </div>
    </motion.div>
  );
}

/* ---------- 공통 스타일 ---------- */
function pageStyle(): React.CSSProperties {
  return {
    background: "var(--paper)",
    borderRadius: "6px 14px 14px 6px",
    padding: "22px 22px 24px",
    boxShadow: "0 20px 44px rgba(60,40,20,0.35), inset 26px 0 30px -26px rgba(120,90,50,0.4)",
    borderLeft: "10px solid var(--cover)",
  };
}
function primaryBtn(): React.CSSProperties {
  return { border: "none", background: "var(--accent)", color: "#fff", borderRadius: 12, padding: "12px 18px", fontSize: 15, fontWeight: 800, boxShadow: "0 4px 0 #a56a24" };
}
function secondaryBtn(): React.CSSProperties {
  return { border: "1px solid var(--accent)", background: "#fff", color: "var(--accent)", borderRadius: 12, padding: "11px 16px", fontSize: 14.5, fontWeight: 700 };
}
function ghostBtn(): React.CSSProperties {
  return { border: "1px solid var(--paper-line)", background: "#fff", color: "var(--ink-soft)", borderRadius: 10, padding: "6px 11px", fontSize: 13 };
}
function entryCard(): React.CSSProperties {
  return { textAlign: "left", border: "1px solid var(--paper-line)", background: "#fff", borderRadius: 12, padding: "12px 14px", boxShadow: "0 2px 6px rgba(0,0,0,0.05)" };
}
