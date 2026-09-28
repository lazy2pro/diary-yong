# Diary-yong 📔

대화하며 써 내려가는 나만의 다이어리. GPT 또는 Gemini와 오늘 하루를 이야기하면, AI가 그 대화를 예쁜 일기 한 편으로 정리해 줍니다. 사진을 추가하면 사진에 담긴 촬영 시각과 위치(GPS)를 함께 기록해요.

## 주요 기능

- **대화형 일기 작성**: AI와 오늘 있었던 일을 편하게 이야기하면, 대화를 바탕으로 1인칭 일기로 자동 정리합니다.
- **GPT / Gemini 선택**: 시작 화면에서 사용할 AI를 고를 수 있어요. 키는 서버(환경변수)에만 저장되어 브라우저에 노출되지 않습니다.
- **사진 첨부**: 완성된 일기에 사진을 추가할 수 있고, 사진의 EXIF에서 촬영 시각·GPS 위치를 읽어 함께 표시합니다. (위치 정보가 없는 사진은 "위치 정보 없음"으로 표시)
- **다이어리 연출**: 표지를 펼치는 시작 화면에서 한 장 한 장 넘기며 일기를 쌓아가는 느낌의 UI.

## 기술 스택

- **Next.js (App Router) + React + TypeScript** — 서버 함수로 AI 키를 안전하게 보관
- **Vercel KV** — 일기 텍스트·메타데이터 저장
- **Vercel Blob** — 사진 파일 저장
- **exifr** — 사진 EXIF에서 촬영 시각/GPS 추출
- **Framer Motion** — 다이어리 펼침/페이지 넘김 애니메이션
- **Tailwind CSS v4**

## 배포 전 필요한 환경변수 (Vercel 프로젝트 설정)

| 변수 | 용도 |
|------|------|
| `OPENAI_API_KEY` | GPT 사용 시 |
| `GEMINI_API_KEY` | Gemini 사용 시 |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Redis(Upstash) 저장소 — Vercel KV/Upstash 통합이 자동 주입. (또는 `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (사진 저장) |
| `KAKAO_REST_API_KEY` | (선택) 사진 GPS → 지명 변환 |

> Vercel 대시보드에서 KV·Blob 스토리지를 프로젝트에 연결하면 관련 토큰은 자동으로 주입됩니다. AI 키만 직접 넣으면 돼요.

## 개발

```bash
npm install
npm run dev
```

## 참고

- 사진의 위치는 파일에 EXIF GPS가 남아 있을 때만 읽을 수 있어요. 일부 메신저/공유 경로는 GPS를 제거하므로, 원본 사진을 올리는 것을 권장합니다.
- 모든 UI 그래픽은 오리지널 디자인입니다.
