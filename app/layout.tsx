import type { Metadata, Viewport } from "next";
import { Gowun_Dodum, Nanum_Pen_Script } from "next/font/google";
import "./globals.css";

// Next.js 권장 방식(next/font)으로 폰트 로드 → 빌드 경고 없이 최적화된 폰트 제공.
// CSS 변수로 연결해 globals.css / 인라인 스타일에서 var(--font-body), var(--font-hand)로 사용.
const gowun = Gowun_Dodum({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const nanumPen = Nanum_Pen_Script({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-hand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Diary-yong",
  description: "대화하며 써 내려가는 나만의 다이어리",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#8a6d4b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${gowun.variable} ${nanumPen.variable}`}>
      <body>{children}</body>
    </html>
  );
}
