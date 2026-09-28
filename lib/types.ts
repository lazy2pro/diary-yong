// 다이어리 앱 공용 타입 정의

export type AiProvider = "openai" | "gemini";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// 사진에 찍힌 위치/시각 정보 (EXIF에서 추출)
export interface PhotoMeta {
  url: string; // Vercel Blob 공개 URL
  addedAt: number; // 업로드 시각 (ms)
  takenAt: number | null; // 사진 촬영 시각 (EXIF) — 없으면 null
  lat: number | null; // 촬영 위도 (EXIF GPS) — 없으면 null
  lng: number | null; // 촬영 경도 (EXIF GPS) — 없으면 null
  place: string | null; // 위경도 → 사람이 읽는 지명 (역지오코딩) — 없으면 null
}

// 다이어리 한 페이지(하루의 일기)
export interface DiaryEntry {
  id: string;
  createdAt: number; // 최초 작성 시각 (ms)
  updatedAt: number; // 마지막 수정 시각 (ms)
  dateKey: string; // 'YYYY-MM-DD' (KST 기준) — 하루 단위 그룹
  title: string; // 일기 제목 (AI가 지어줌 또는 사용자 지정)
  body: string; // 일기 본문 (AI가 대화를 정리해 써 내려간 글)
  mood: string | null; // 오늘의 기분 이모지 (선택)
  chat: ChatMessage[]; // 이 일기를 쓰기까지의 대화 기록
  photos: PhotoMeta[]; // 첨부 사진들
}

// 목록 화면용 요약(본문/대화 제외)
export interface DiaryEntrySummary {
  id: string;
  createdAt: number;
  updatedAt: number;
  dateKey: string;
  title: string;
  mood: string | null;
  photoCount: number;
  preview: string; // 본문 앞부분 미리보기
}
