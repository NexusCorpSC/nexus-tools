import type { NextConfig } from "next";

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
};

export default nextConfig;
