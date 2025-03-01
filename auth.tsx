import NextAuth from "next-auth";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import db from "@/lib/db";
import authConfig from "@/auth.config";
import { customAlphabet } from "nanoid";
import { Resend } from "resend";
import VerifyEmail from "@/mails/verify-email";

const generateAuthCode = customAlphabet("0123456789", 6);

const resend = new Resend(process.env.RESEND_API_KEY);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: MongoDBAdapter(db),
  session: { strategy: "jwt" },
  ...authConfig,
  providers: [
    {
      name: "email",
      id: "email",
      type: "email",
      async sendVerificationRequest({ identifier, url, token }) {
        const callbackUrl = new URL(url);

        const signInURL = new URL(
          `/auth/verify?${callbackUrl.searchParams}`,
          callbackUrl.origin,
        );

        if (process.env.RESEND_API_KEY === 'CONSOLE') {

          console.log('Verify your email to access Nexus Tools');
          console.log(`URL: ${signInURL.toString()}`);
          console.log(`Email: ${identifier}`);
          console.log(`Token: ${token}`);
        } else {
          await resend.emails.send({
            from: "tools@services.nexus",
            to: identifier,
            subject: "Verify your email to access Nexus Tools",
            react: (
              <VerifyEmail
                url={signInURL.toString()}
                email={identifier}
                token={token}
              />
            ),
          });
        }
      },
      async generateVerificationToken() {
        return generateAuthCode();
      },
    },
  ],
  callbacks: {
    async jwt(params) {
      if (params.user) {
        params.token.id = params.user.id;
      }

      return params.token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;

      return session;
    },
  },
});
