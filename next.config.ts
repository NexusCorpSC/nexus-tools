import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Le rastériseur des aperçus de plans côté serveur (`lib/plan-preview.ts`)
  // est un module natif : il se charge tel quel, sans passer par le bundler.
  serverExternalPackages: ["@resvg/resvg-js"],
  // Et il lit la police de l'interface sur le disque : la route MCP l'emporte,
  // avec la page compilée des vues MCP Apps (`npm run mcp:views`).
  outputFileTracingIncludes: {
    "/mcp": ["./app/fonts/*.woff", "./lib/mcp/views/dist/*.html"],
  },
  images: {
    // Chaque variante (source × largeur × format) transformée est facturée par
    // Vercel, et refaite à chaque expiration de son cache : le plus long de ce
    // délai et du Cache-Control de la source. Le blob storage annonce déjà un
    // mois ; on aligne les autres sources dessus au lieu des 4 h par défaut.
    minimumCacheTTL: 2_678_400,
    // Moins de largeurs possibles, ce sont moins de variantes par image et plus
    // de requêtes qui retombent sur une variante déjà en cache. Les 2048 et
    // 3840 px par défaut ne servaient qu'aux écrans 4K, au prix fort.
    deviceSizes: [640, 828, 1080, 1920],
    imageSizes: [32, 64, 128, 256, 384],
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
      // Plans des véhicules (vues orthographiques de Fleetyards) quand ils ne
      // sont pas recopiés dans le blob storage. L'url publiée est une
      // redirection vers le stockage, que l'optimiseur suit.
      {
        protocol: "https",
        hostname: "api.fleetyards.net",
        port: "",
      },
      {
        protocol: "https",
        hostname: "storage.fltyrd.net",
        port: "",
      },
    ],
  },
  experimental: {
    agentUpgrade: "latest",
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
