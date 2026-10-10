import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/** La configuration OpenID, sous l'émetteur (`/api/auth`). */
export const GET = oauthProviderOpenIdConfigMetadata(auth);
