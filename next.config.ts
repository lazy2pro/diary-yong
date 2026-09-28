import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Vercel Blob에 올린 사진을 next/image로 표시할 수 있도록 허용
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
