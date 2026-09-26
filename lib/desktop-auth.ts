import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/**
 * Connexion de l'application de bureau (nexus-app) par le navigateur.
 *
 * L'application ouvre `/desktop/connect` dans le navigateur, en écoutant sur un
 * port de la boucle locale. Le site connecte l'utilisateur s'il ne l'est pas
 * déjà, puis le renvoie vers ce port avec un code à usage unique. L'application
 * échange ce code contre une session à elle (`POST /api/auth/desktop/exchange`)
 * — pas celle du navigateur : se déconnecter de l'un ne déconnecte pas l'autre.
 *
 * Le code seul ne suffit pas : l'application a d'abord envoyé l'empreinte d'un
 * secret qu'elle garde (PKCE, RFC 7636), et doit le produire à l'échange. Un
 * autre programme qui intercepterait la redirection n'en ferait rien.
 */

/** Durée de vie d'un code : le temps d'un aller-retour, pas davantage. */
const CODE_TTL_MS = 2 * 60 * 1000;

const IDENTIFIER_PREFIX = "desktop-code:";

/** Base64url sans remplissage, 43 à 128 caractères : la forme PKCE. */
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isPkceValue(value: unknown): value is string {
  return typeof value === "string" && PKCE_PATTERN.test(value);
}

type StoredCode = { userId: string; challenge: string };

/**
 * Le plugin better-auth qui porte l'échange. L'émission du code n'est pas un
 * endpoint : elle n'a lieu que côté serveur, depuis la page de connexion (voir
 * `issueDesktopCode`).
 */
export function desktopAuth() {
  return {
    id: "desktop-auth",
    endpoints: {
      exchangeDesktopCode: createAuthEndpoint(
        "/desktop/exchange",
        { method: "POST" },
        async (ctx) => {
          const body = (ctx.body ?? {}) as { code?: unknown; verifier?: unknown };

          // Le code a la même forme qu'un verifier : 32 octets en base64url.
          if (!isPkceValue(body.code) || !isPkceValue(body.verifier)) {
            throw ctx.error("BAD_REQUEST", { message: "Requête invalide." });
          }

          const identifier = IDENTIFIER_PREFIX + sha256(body.code);
          const stored =
            await ctx.context.internalAdapter.findVerificationValue(identifier);

          if (!stored) {
            throw ctx.error("BAD_REQUEST", { message: "Code inconnu." });
          }

          // Usage unique, qu'il réussisse ou non.
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(
            identifier,
          );

          if (stored.expiresAt < new Date()) {
            throw ctx.error("BAD_REQUEST", { message: "Code expiré." });
          }

          let value: StoredCode;
          try {
            value = JSON.parse(stored.value) as StoredCode;
          } catch {
            throw ctx.error("BAD_REQUEST", { message: "Code invalide." });
          }

          if (!sameString(sha256(body.verifier), value.challenge)) {
            throw ctx.error("BAD_REQUEST", { message: "Code invalide." });
          }

          const user = await ctx.context.internalAdapter.findUserById(
            value.userId,
          );
          if (!user) {
            throw ctx.error("BAD_REQUEST", { message: "Compte introuvable." });
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          await setSessionCookie(ctx, { session, user });

          return ctx.json({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image ?? null,
          });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

/**
 * Émet un code pour `userId`, lié à l'empreinte PKCE de l'application.
 *
 * Stocké haché : la table de vérification ne contient rien qu'on puisse
 * rejouer.
 */
export async function issueDesktopCode(
  context: {
    internalAdapter: {
      createVerificationValue(data: {
        identifier: string;
        value: string;
        expiresAt: Date;
      }): Promise<unknown>;
    };
  },
  userId: string,
  challenge: string,
): Promise<string> {
  if (!isPkceValue(challenge)) {
    throw new Error("PKCE challenge must be base64url, 43 to 128 characters");
  }

  const code = randomBytes(32).toString("base64url");

  await context.internalAdapter.createVerificationValue({
    identifier: IDENTIFIER_PREFIX + sha256(code),
    value: JSON.stringify({ userId, challenge } satisfies StoredCode),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  return code;
}
