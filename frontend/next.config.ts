import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // 挂在 /texlive 子路径
  basePath: "/texlive",

  // 静态资源前缀也加 /texlive
  assetPrefix: "/texlive",
};

export default nextConfig;
