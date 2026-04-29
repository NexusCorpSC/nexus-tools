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
  metadataBase: new URL("https://tools.nexus.services"),
  title: {
    template: "%s | Nexus Tools",
    default: "Nexus Tools — Star Citizen Community Tools",
  },
  description:
    "Nexus Tools est une boîte à outils communautaire pour Star Citizen : marketplace, crafting, réputations, organisations et plus encore.",
  keywords: [
    "Star Citizen",
    "tools",
    "outils",
    "crafting",
    "marketplace",
    "reputation",
    "organisation",
    "Nexus Corporation",
  ],
  authors: [{ name: "Nexus Corporation", url: "https://tools.nexus.services" }],
  creator: "Nexus Corporation",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://tools.nexus.services",
    siteName: "Nexus Tools",
    title: "Nexus Tools — Star Citizen Community Tools",
    description:
      "Une boîte à outils communautaire pour Star Citizen : marketplace, crafting, réputations et organisations.",
    images: [
      {
        url: "/nexus_logo_square.png",
        width: 512,
        height: 512,
        alt: "Nexus Tools logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Nexus Tools — Star Citizen Community Tools",
    description:
      "Une boîte à outils communautaire pour Star Citizen : marketplace, crafting, réputations et organisations.",
    images: ["/nexus_logo_square.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
