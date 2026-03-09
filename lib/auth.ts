import { betterAuth } from "better-auth";
import { emailOTP, admin } from "better-auth/plugins";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

import { Resend } from "resend";
import db from "@/lib/db";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: mongodbAdapter(db.db(), {
    usePlural: true,
  }),
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
  ],
});
