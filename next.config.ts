import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
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
