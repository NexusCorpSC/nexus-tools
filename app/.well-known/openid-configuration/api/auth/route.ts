import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/** La configuration OpenID, à l'adresse « insérée » que certains clients lisent. */
export const GET = oauthProviderOpenIdConfigMetadata(auth);
