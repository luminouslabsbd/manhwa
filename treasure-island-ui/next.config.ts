import type { NextConfig } from "next";

const DO_CDN = process.env.DO_SPACES_BUCKET && process.env.DO_SPACES_REGION
  ? `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION}.digitaloceanspaces.com/${process.env.DO_SPACES_PREFIX ?? "manhwa-studio"}`
  : null;

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  serverExternalPackages: ["pdf-parse"],
  ...(DO_CDN && {
    async redirects() {
      return [
        {
          source: "/generated/:path*",
          destination: `${DO_CDN}/generated/:path*`,
          permanent: false,
        },
      ];
    },
  }),
};

export default nextConfig;
