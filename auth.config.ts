import type { NextAuthConfig } from "next-auth"

// Notice this is only an object, not a full Auth.js instance
export default {
  providers: [],
  pages: {
    signIn: "/login",
    verifyRequest: "/auth/verify",
  },
} satisfies NextAuthConfig;
