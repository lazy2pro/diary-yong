import { NextRequest, NextResponse } from "next/server";
import { getEntry, saveEntry, deleteEntry } from "@/lib/store";

export const dynamic = "force-dynamic";

// 개별 일기 조회
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = await getEntry(id);
    if (!entry) return NextResponse.json({ error: "일기를 찾을 수 없어요." }, { status: 404 });
    return NextResponse.json({ entry });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? String(error) }, { status: 500 });
  }
}

// 일기 수정 (제목/본문/기분 등)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = await getEntry(id);
    if (!entry) return NextResponse.json({ error: "일기를 찾을 수 없어요." }, { status: 404 });
    const b = await req.json();
    if (typeof b?.title === "string") entry.title = b.title.slice(0, 80);
    if (typeof b?.body === "string") entry.body = b.body;
    if (typeof b?.mood === "string" || b?.mood === null) entry.mood = b.mood ? String(b.mood).slice(0, 4) : null;
    await saveEntry(entry);
    return NextResponse.json({ entry });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? String(error) }, { status: 500 });
  }
}

// 일기 삭제
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteEntry(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? String(error) }, { status: 500 });
  }
}
