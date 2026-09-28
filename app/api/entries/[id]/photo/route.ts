import { NextRequest, NextResponse } from "next/server";
import { errMsg } from "@/lib/util";
import { put } from "@vercel/blob";
import exifr from "exifr";
import { getEntry, saveEntry } from "@/lib/store";
import type { PhotoMeta } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 위경도 → 지명 (역지오코딩). 카카오 키가 있으면 사용, 없으면 null.
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lng}&y=${lat}`,
      { headers: { Authorization: `KakaoAK ${key}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const doc = data?.documents?.[0];
    const road = doc?.road_address?.address_name;
    const jibun = doc?.address?.address_name;
    return road || jibun || null;
  } catch {
    return null;
  }
}

// 사진 업로드: 원본 바이트에서 EXIF(촬영 시각·GPS) 추출 후 Vercel Blob에 저장.
// multipart/form-data 필드 'file'.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = await getEntry(id);
    if (!entry) return NextResponse.json({ error: "일기를 찾을 수 없어요." }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "사진 파일이 필요해요." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());

    // EXIF에서 촬영 시각과 GPS 추출 (원본 바이트 기준이라 위치가 보존돼 있으면 읽힘)
    let takenAt: number | null = null;
    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const exif = await exifr.parse(bytes, { gps: true });
      if (exif?.DateTimeOriginal) {
        const d = new Date(exif.DateTimeOriginal);
        if (!Number.isNaN(d.getTime())) takenAt = d.getTime();
      }
      if (typeof exif?.latitude === "number" && typeof exif?.longitude === "number") {
        lat = exif.latitude;
        lng = exif.longitude;
      }
    } catch {
      // EXIF 없거나 파싱 실패 → 위치/시각 없음으로 진행
    }

    const place = lat != null && lng != null ? await reverseGeocode(lat, lng) : null;

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const blob = await put(`diary/${id}/${Date.now()}.${ext}`, bytes, {
      access: "public",
      contentType: file.type || "image/jpeg",
    });

    const photo: PhotoMeta = {
      url: blob.url,
      addedAt: Date.now(),
      takenAt,
      lat,
      lng,
      place,
    };
    entry.photos.push(photo);
    await saveEntry(entry);

    return NextResponse.json({ photo, entry });
  } catch (error: unknown) {
    return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  }
}
