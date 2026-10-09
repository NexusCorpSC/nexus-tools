import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { emailOTP, admin, jwt } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

import { Resend } from "resend";
import db from "@/lib/db";
import { desktopAuth } from "@/lib/desktop-auth";
import { MCP_SCOPES, OIDC_SCOPES, mcpResource } from "@/lib/mcp/oauth-config";

const resend = new Resend(process.env.RESEND_API_KEY);

export function generateUserNamme() {
  const adjectives = [
    "Sombre",
    "Lumineux",
    "Rapide",
    "Furtif",
    "Puissant",
    "Mystérieux",
    "Élégant",
    "Féroce",
    "Agile",
    "Sage",
  ];
  const nouns = [
    "Dragon",
    "Phénix",
    "Loup",
    "Tigre",
    "Serpent",
    "Griffon",
    "Licorne",
    "Chimère",
    "Hydre",
    "Sphinx",
  ];

  const randomAdjective =
    adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

  return `${randomAdjective}${randomNoun}`;
}

/**
 * Génère un discriminateur aléatoire à 4 chiffres (0000-9999)
 * @returns Un string de 4 chiffres
 */
export function generateDiscriminator(): string {
  const randomNumber = Math.floor(Math.random() * 10000);
  return randomNumber.toString().padStart(4, "0");
}

/** Une redirection d'application native : boucle locale en http, ou schéma privé. */
function isNativeRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol === "http:") {
      return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    }
    return url.protocol !== "https:";
  } catch {
    return false;
  }
}

export const auth = betterAuth({
  database: mongodbAdapter(db.db(), {
    usePlural: true,
  }),
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
    },
  },
  plugins: [
    admin(),
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        if (process.env.RESEND_API_KEY === "CONSOLE") {
          console.log("Verify your email to access Nexus Tools");
          console.log(`OTP: ${otp}`);
          console.log(`Email: ${email}`);
        } else {
          await resend.emails.send({
            from: "tools@services.nexus",
            to: email,
            subject: "Verify your email to access Nexus Tools",
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Votre code de vérification</h2>
                <p>Utilisez le code suivant pour vous connecter :</p>
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                  <h1 style="font-size: 32px; letter-spacing: 8px; margin: 0;">${otp}</h1>
                </div>
                <p>Ce code expirera dans quelques minutes.</p>
                <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas demandé ce code, vous pouvez ignorer cet email.</p>
              </div>
            `,
          });
        }
      },
    }),
    passkey({
      rpID: "services.nexus",
      rpName: "Nexus Services",
    }),
    desktopAuth(),
    // Les assistants (Claude, ChatGPT, VS Code…) se connectent au compte par
    // OAuth pour les outils MCP personnels : inventaire, commandes, ventes,
    // contributions. `mcp()` est le fournisseur OAuth réglé pour MCP : les
    // jetons sont des JWT liés à la ressource `/mcp`, signés par `jwt()`.
    jwt(),
    mcp({
      loginPage: "/login",
      consentPage: "/oauth/consent",
      resource: mcpResource(),
      // Une heure : c'est ce que l'écran « Applications connectées » promet
      // quand on retire un accès (le JWT reste valable jusqu'à expiration).
      accessTokenExpiresIn: 60 * 60,
      scopes: [...OIDC_SCOPES, ...MCP_SCOPES],
      clientRegistrationDefaultScopes: [...OIDC_SCOPES, ...MCP_SCOPES],
      // La spec MCP 2026-07-28 préfère les CIMD (ci-dessous) ; l'inscription
      // dynamique reste ouverte pour les clients qui ne les connaissent pas.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
  // Le `/token` de `jwt()` rendrait un JWT pour la session du navigateur :
  // rien ne s'en sert, et les jetons d'accès passent par `/oauth2/token`.
  disabledPaths: ["/token"],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/oauth2/register") return;
      const body = ctx.body as Record<string, unknown> | undefined;
      if (!body || body.application_type !== undefined) return;
      // Les clients MCP de bureau (Claude Code, VS Code, Cursor…) s'inscrivent
      // sans `application_type`, avec une redirection http://localhost ou un
      // schéma d'application. better-auth les prendrait pour des clients web,
      // qui exigent https : ce sont des clients natifs (RFC 8252).
      const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
      const native =
        uris.length > 0 &&
        uris.every(
          (uri) => typeof uri === "string" && isNativeRedirectUri(uri),
        );
      if (native) {
        return { context: { body: { ...body, application_type: "native" } } };
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          return {
            data: {
              // Enforce user name to be defined, use random if needed
              ...user,
              name:
                user.name ||
                `${generateUserNamme()}#${generateDiscriminator()}`,
            },
          };
        },
      },
    },
  },
  trustedOrigins: process.env.NEXT_PUBLIC_BASE_URL
    ? [process.env.NEXT_PUBLIC_BASE_URL]
    : ["http://localhost:3000", "https://localhost:3000"],
  baseURL:
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000",
});
