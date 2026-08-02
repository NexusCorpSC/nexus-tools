import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowDownTrayIcon,
  BellAlertIcon,
  BoltIcon,
  CameraIcon,
  CodeBracketIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  Square2StackIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

const APP_RELEASES_URL =
  "https://github.com/NexusCorpSC/nexus-app/releases/latest";
const APP_REPOSITORY_URL = "https://github.com/NexusCorpSC/nexus-app";

const highlights = [
  { key: "overlay", icon: Square2StackIcon },
  { key: "shortcuts", icon: BoltIcon },
  { key: "capture", icon: CameraIcon },
  { key: "squad", icon: UserGroupIcon },
  { key: "notifications", icon: BellAlertIcon },
  { key: "updates", icon: ShieldCheckIcon },
] as const;

const shortcuts = ["search", "capture", "notes", "cargo"] as const;

export default function NexusAppShowcase() {
  const t = useTranslations("HomePage.app");

  return (
    <section className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/40 px-6 py-12 backdrop-blur-sm sm:px-10 lg:px-14">
        <div className="pointer-events-none absolute -top-32 -right-24 h-[420px] w-[420px] rounded-full bg-[#9ED0FF]/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-[420px] w-[420px] rounded-full bg-[#CCE7FF]/5 blur-3xl" />

        <div className="relative grid items-center gap-14 lg:grid-cols-2">
          {/* Pitch */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#9ED0FF]/30 bg-[#9ED0FF]/10 px-4 py-1.5 text-xs font-medium text-[#9ED0FF] backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#9ED0FF] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#9ED0FF]" />
              </span>
              {t("eyebrow")}
            </div>

            <h2 className="mt-6 text-3xl font-bold tracking-tight text-[#C9E4FF] sm:text-4xl">
              {t("title")}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#9ED0FF]/70">
              {t("description")}
            </p>

            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {highlights.map(({ key, icon: Icon }) => (
                <li key={key} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#9ED0FF]/20 bg-[#9ED0FF]/10">
                    <Icon className="h-4 w-4 text-[#9ED0FF]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#C9E4FF]">
                      {t(`highlights.${key}.title`)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#9ED0FF]/55">
                      {t(`highlights.${key}.description`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={APP_RELEASES_URL}
                className="inline-flex items-center gap-2 rounded-lg bg-[#9ED0FF] px-6 py-3 text-sm font-semibold text-[#092F49] shadow-lg shadow-[#9ED0FF]/20 transition-colors hover:bg-[#CCE7FF]"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {t("download")}
              </Link>
              <Link
                href={APP_REPOSITORY_URL}
                className="inline-flex items-center gap-2 rounded-lg border border-[#9ED0FF]/30 bg-[#9ED0FF]/10 px-6 py-3 text-sm font-semibold text-[#C9E4FF] backdrop-blur-sm transition-colors hover:bg-[#9ED0FF]/20"
              >
                <CodeBracketIcon className="h-4 w-4" />
                {t("source")}
              </Link>
            </div>
            <p className="mt-4 text-xs text-[#9ED0FF]/45">{t("platforms")}</p>
          </div>

          {/* Mock de l'application */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="overflow-hidden rounded-2xl border border-[#9ED0FF]/15 bg-[#061E30] shadow-2xl shadow-black/40"
            >
              <div className="flex items-center gap-1.5 border-b border-[#9ED0FF]/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                <span className="ml-3 text-[11px] font-medium text-[#9ED0FF]/50">
                  Nexus App
                </span>
              </div>

              <div className="flex min-h-[300px]">
                <div className="hidden w-36 shrink-0 flex-col gap-1 border-r border-[#9ED0FF]/10 p-3 sm:flex">
                  {[
                    "Blueprints",
                    "Missions",
                    "Réputations",
                    "Inventaire",
                    "Cargo",
                  ].map((item, index) => (
                    <span
                      key={item}
                      className={`rounded-lg px-3 py-2 text-[11px] ${
                        index === 0
                          ? "bg-[#9ED0FF]/15 font-medium text-[#C9E4FF]"
                          : "text-[#9ED0FF]/45"
                      }`}
                    >
                      {item}
                    </span>
                  ))}
                </div>

                <div className="flex-1 p-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map((index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-[#9ED0FF]/10 bg-[#0B3A5A]/50 p-3"
                      >
                        <div className="h-10 rounded bg-[#9ED0FF]/5" />
                        <div className="mt-2 h-2 w-3/4 rounded-full bg-[#9ED0FF]/20" />
                        <div className="mt-1.5 h-2 w-1/2 rounded-full bg-[#9ED0FF]/10" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Palette de recherche en superposition */}
            <div
              aria-hidden="true"
              className="absolute -bottom-6 -left-4 w-[85%] rounded-xl border border-[#9ED0FF]/25 bg-[#092F49]/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-md sm:-left-8"
            >
              <div className="flex items-center gap-2 border-b border-[#9ED0FF]/10 pb-2.5">
                <MagnifyingGlassIcon className="h-4 w-4 text-[#9ED0FF]/60" />
                <span className="text-xs text-[#9ED0FF]/70">
                  {t("mock.searchPlaceholder")}
                </span>
              </div>
              <div className="mt-2.5 space-y-1.5">
                <div className="flex items-center justify-between rounded-lg bg-[#9ED0FF]/10 px-2.5 py-2">
                  <span className="text-[11px] text-[#C9E4FF]">
                    {t("mock.resultPrimary")}
                  </span>
                  <span className="text-[10px] text-[#9ED0FF]/40">↵</span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-2">
                  <span className="text-[11px] text-[#9ED0FF]/45">
                    {t("mock.resultSecondary")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Raccourcis globaux */}
        <div className="relative mt-16 border-t border-[#9ED0FF]/10 pt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#9ED0FF]/50">
            {t("shortcutsTitle")}
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut}
                className="rounded-xl border border-[#9ED0FF]/15 bg-[#061E30]/60 px-4 py-3"
              >
                <dt className="font-mono text-xs font-semibold text-[#C9E4FF]">
                  {t(`shortcuts.${shortcut}.keys`)}
                </dt>
                <dd className="mt-1.5 text-xs text-[#9ED0FF]/55">
                  {t(`shortcuts.${shortcut}.label`)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs text-[#9ED0FF]/45">{t("shortcutsHint")}</p>
        </div>
      </div>
    </section>
  );
}
