import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // GitHub Pages serves project sites under /<repo>/; unset for root-domain hosts.
  basePath: process.env.BASE_PATH ?? "",
  reactStrictMode: true,
  // Emit `/route/index.html` instead of `/route.html` for static hosts
  // (Cloudflare Pages, etc.) that expect directory-style routes.
  trailingSlash: true,
};

export default nextConfig;
