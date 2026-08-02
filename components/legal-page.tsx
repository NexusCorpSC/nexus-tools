import Link from "next/link";
import GlowBackground from "@/components/glow-background";

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface LegalPageProps {
  eyebrow: string;
  title: string;
  intro: string;
  updatedAt: string;
  sections: LegalSection[];
}

export default function LegalPage({
  eyebrow,
  title,
  intro,
  updatedAt,
  sections,
}: LegalPageProps) {
  return (
    <div className="relative overflow-hidden">
      <GlowBackground />

      <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#9ED0FF]/50">
            {eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-[#C9E4FF] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-6 text-base leading-relaxed text-[#9ED0FF]/70">
            {intro}
          </p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#9ED0FF]/20 bg-[#9ED0FF]/5 px-4 py-1.5 text-xs text-[#9ED0FF]/60">
            Dernière mise à jour : {updatedAt}
          </p>
        </header>

        <div className="mt-16 grid gap-10 lg:grid-cols-[260px_1fr] lg:items-start">
          <nav
            aria-label="Sommaire"
            className="rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/50 p-5 backdrop-blur-sm lg:sticky lg:top-24"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-[#9ED0FF]/50">
              Sommaire
            </p>
            <ol className="mt-4 space-y-1.5">
              {sections.map((section, index) => (
                <li key={section.id}>
                  <Link
                    href={`#${section.id}`}
                    className="flex gap-2 rounded-lg px-2 py-1.5 text-sm text-[#9ED0FF]/60 transition-colors hover:bg-[#9ED0FF]/10 hover:text-[#C9E4FF]"
                  >
                    <span className="tabular-nums text-[#9ED0FF]/35">
                      {index + 1}.
                    </span>
                    {section.title}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-4">
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/50 p-6 shadow-xl shadow-black/10 backdrop-blur-sm sm:p-8"
              >
                <h2 className="flex items-baseline gap-3 text-xl font-semibold tracking-tight text-[#C9E4FF]">
                  <span className="text-sm font-mono tabular-nums text-[#9ED0FF]/40">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {section.title}
                </h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-[#9ED0FF]/75 [&_a]:text-[#C9E4FF] [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-white [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-[#C9E4FF] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
