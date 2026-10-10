import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/**
 * Les métadonnées du serveur d'autorisation (RFC 8414). L'émetteur est
 * `/api/auth` : la RFC insère son chemin après `/.well-known/…`.
 */
export const GET = oauthProviderAuthServerMetadata(auth);
