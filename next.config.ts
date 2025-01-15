import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "gwgsmex5adyadzri.public.blob.vercel-storage.com",
        search: "",
        port: "",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
        search: "",
        port: "",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
