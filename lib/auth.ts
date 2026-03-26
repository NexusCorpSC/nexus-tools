import { betterAuth } from "better-auth";
import { emailOTP, admin } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { mongodbAdapter } from "better-auth/adapters/mongodb";

import { Resend } from "resend";
import db from "@/lib/db";

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
    passkey({
      rpID: 'services.nexus',
      rpName: 'Nexus Services',
    }),
  ],
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
