import NextAuth from "next-auth"
import {MongoDBAdapter} from "@auth/mongodb-adapter";
import db from "@/lib/db";
import authConfig from "@/auth.config";
import {customAlphabet} from "nanoid";

const generateAuthCode = customAlphabet("0123456789", 6);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: MongoDBAdapter(db),
  session: { strategy: 'jwt' },
  ...authConfig,
  providers: [
    {
      name: 'email',
      id: 'email',
      type: 'email',
      async sendVerificationRequest({ identifier, url, token }) {
        const callbackUrl = new URL(url);

        console.log(callbackUrl.searchParams);

        const signInURL = new URL(`/auth/verify?${callbackUrl.searchParams}`, callbackUrl.origin);

        console.log('sendVerificationRequest', identifier, token, signInURL.toString());
      },
      async generateVerificationToken() {
        return generateAuthCode();
      },
    },
  ],
});
