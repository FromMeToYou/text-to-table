import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  // Emit `/route/index.html` instead of `/route.html` for static hosts
  // (Cloudflare Pages, etc.) that expect directory-style routes.
  trailingSlash: true,
};

export default nextConfig;
