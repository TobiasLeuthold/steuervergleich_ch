import type { NextConfig } from "next";

// Static export: the app is plain HTML/JS plus the precomputed JSON in
// public/data, so it can be hosted anywhere (Vercel, GitHub Pages, Netlify).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
};

export default nextConfig;
