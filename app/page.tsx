import type { Metadata } from "next";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ShoppingCartIcon, WrenchScrewdriverIcon, StarIcon, CodeBracketIcon } from "@heroicons/react/24/outline";

import GlowBackground from "@/components/glow-background";
import FeatureCard from "@/components/feature-card";
import LinkButton from "@/components/ui/link-button";
import ImgCrafting from "./img-crafting.png";
import ImgReputation from "./img-reputation.png";
import ImgShopping from "./img-shopping.png";

export const metadata: Metadata = {
  title: "Accueil",
  description:
    "Nexus Tools — la boîte à outils communautaire pour Star Citizen. Gérez votre inventaire, vos réputations, vos organisations et achetez ou vendez sur le marketplace.",
  openGraph: {
    title: "Nexus Tools — Star Citizen Community Tools",
    description:
      "Marketplace, crafting, réputations et organisations pour les joueurs de Star Citizen.",
    url: "https://tools.nexus.services",
  },
};

export default function Home() {
  const t = useTranslations("HomePage");

  return (
    <div className="relative overflow-hidden">
      <GlowBackground />

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pt-20 pb-16 text-center lg:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#9ED0FF]/30 bg-[#9ED0FF]/10 px-4 py-1.5 text-xs font-medium text-[#9ED0FF] mb-8 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#9ED0FF] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#9ED0FF]" />
          </span>
          Star Citizen · Community Tools
        </div>

        <h1 className="text-5xl font-bold tracking-tight text-[#C9E4FF] sm:text-6xl lg:text-7xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[#9ED0FF]/80 leading-relaxed">
          {t("intro1")}
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-sm text-[#9ED0FF]/50 leading-relaxed">
          {t("intro2")}
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <LinkButton href="/shopping">
            {t("features.marketplace.title")}
          </LinkButton>
          <LinkButton href="/crafting" variant="ghost">
            {t("features.crafting.title")}
          </LinkButton>
        </div>
      </section>

      {/* Features grid */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#9ED0FF]/50 mb-4">
          {t("features.subtitle")}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2 pb-20">

          {/* Marketplace — tall left */}
          <div className="lg:row-span-2">
            <FeatureCard
              href="/shopping"
              icon={<ShoppingCartIcon className="h-5 w-5 text-[#9ED0FF]" />}
              title={t("features.marketplace.title")}
              description={t("features.marketplace.description")}
              className="min-h-[460px]"
            >
              <div className="relative flex-1 overflow-hidden mx-8 mb-0 rounded-t-xl">
                <Image
                  className="w-full h-full object-cover object-top opacity-80 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500"
                  src={ImgShopping}
                  alt=""
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#092F49] via-transparent to-transparent" />
              </div>
            </FeatureCard>
          </div>

          {/* Crafting — top middle */}
          <div>
            <FeatureCard
              href="/crafting"
              icon={<WrenchScrewdriverIcon className="h-5 w-5 text-[#9ED0FF]" />}
              title={t("features.crafting.title")}
              description={t("features.crafting.description")}
              className="min-h-[220px]"
            >
              <div className="flex flex-1 items-end justify-center px-8 pb-6 overflow-hidden">
                <Image
                  className="w-full max-w-[200px] opacity-70 group-hover:opacity-90 group-hover:scale-[1.03] transition-all duration-500"
                  alt=""
                  src={ImgCrafting}
                />
              </div>
            </FeatureCard>
          </div>

          {/* Reputation — bottom middle */}
          <div className="lg:col-start-2 lg:row-start-2">
            <FeatureCard
              href="/reps"
              icon={<StarIcon className="h-5 w-5 text-[#9ED0FF]" />}
              title={t("features.reputation.title")}
              description={t("features.reputation.description")}
              className="min-h-[220px]"
            >
              <div className="flex flex-1 items-center overflow-hidden px-8 pb-4">
                <Image
                  className="h-28 w-auto object-cover opacity-70 group-hover:opacity-90 transition-all duration-500"
                  src={ImgReputation}
                  alt=""
                />
              </div>
            </FeatureCard>
          </div>

          {/* Developers — tall right */}
          <div className="lg:row-span-2">
            <FeatureCard
              href="/developers"
              icon={<CodeBracketIcon className="h-5 w-5 text-[#9ED0FF]" />}
              title={t("features.developers.title")}
              description={t("features.developers.description")}
              className="min-h-[460px]"
            >
              <div className="relative flex-1 mx-8 mb-0 rounded-t-xl overflow-hidden bg-[#061E30] border-t border-x border-[#9ED0FF]/10">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#9ED0FF]/10">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                </div>
                <pre className="p-4 text-xs leading-relaxed font-mono text-[#9ED0FF]/80 overflow-hidden">
                  <span className="text-[#9ED0FF]/40">{"// Fetch player reputations"}</span>{"\n"}
                  <span className="text-[#CCE7FF]">{"const "}</span>
                  <span className="text-[#9ED0FF]">{"players "}</span>
                  <span className="text-[#CCE7FF]">{"= await"}</span>{"\n"}
                  {"  "}
                  <span className="text-[#CCE7FF]">{"fetch("}</span>
                  <span className="text-[#9ED0FF]/70">{"\n    'https://tools.nexus"}</span>
                  <span className="text-[#9ED0FF]/70">{".services/api/reps'"}</span>
                  <span className="text-[#CCE7FF]">{"\n  );"}</span>{"\n"}
                  <span className="text-[#CCE7FF]">{"const "}</span>
                  <span className="text-[#9ED0FF]">{"data "}</span>
                  <span className="text-[#CCE7FF]">{"= await"}</span>{"\n"}
                  {"  "}
                  <span className="text-[#9ED0FF]">{"players"}</span>
                  <span className="text-[#CCE7FF]">{".json();"}</span>
                </pre>
              </div>
            </FeatureCard>
          </div>

        </div>
      </div>
    </div>
  );
}
