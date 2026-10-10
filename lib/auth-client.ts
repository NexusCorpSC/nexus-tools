import { createAuthClient } from "better-auth/react";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
  // `oauthProviderClient` joint la demande OAuth en cours (`oauth_query`) aux
  // appels de connexion et de consentement : c'est ce qui reprend la connexion
  // d'un assistant MCP après la page de login.
  plugins: [
    adminClient(),
    emailOTPClient(),
    passkeyClient(),
    oauthProviderClient(),
  ],
});
