import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // 把页面和静态资源都挂在 /texlive 前缀下
  basePath: "/texlive",
  // 这里不要再加 assetPrefix，否则路径会变成 /texlive/texlive/_next/...
  // assetPrefix: "/texlive",
};

export default nextConfig;
