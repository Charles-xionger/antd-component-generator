import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
    // 允许解析到私有 IP，用于开发环境
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // 开发环境配置
  ...(process.env.NODE_ENV === "development" && {
    experimental: {
      serverActions: {
        allowedOrigins: ["localhost:3000"],
      },
    },
  }),
};

export default nextConfig;
