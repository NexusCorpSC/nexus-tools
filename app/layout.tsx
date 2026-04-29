import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Footer from "@/components/footer";
import Topbar from "@/components/topbar";
import { getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "@/components/ui/sonner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Nexus Tools",
  description: "A collection of tools for Star Citizen.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();

  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          <Topbar />
          <div className="relative min-h-dvh bg-nexus">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -top-48 left-1/2 h-[560px] w-[840px] -translate-x-1/2 rounded-full bg-[#9ED0FF]/8 blur-3xl" />
              <div className="absolute top-1/3 -left-56 h-[360px] w-[560px] rounded-full bg-[#CCE7FF]/4 blur-3xl" />
              <div className="absolute top-1/2 -right-56 h-[360px] w-[560px] rounded-full bg-[#9ED0FF]/4 blur-3xl" />
            </div>
            <div className="relative">{children}</div>
          </div>
          <Footer />
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
