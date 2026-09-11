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
      // Illustrations des objets importés (scripts/import-catalogue.ts) quand
      // elles ne sont pas recopiées dans le blob storage.
      {
        protocol: "https",
        hostname: "media.robertsspaceindustries.com",
        port: "",
      },
      {
        protocol: "https",
        hostname: "media.starcitizen.tools",
        port: "",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
      allowedOrigins:
        process.env.NODE_ENV === "development"
          ? ["localhost:3000", process.env.DEV_URL ?? "localhost:3000"]
          : undefined,
    },
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
