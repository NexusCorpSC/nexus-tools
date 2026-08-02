import Link from "next/link";
import { ArrowUpRightIcon } from "@heroicons/react/24/outline";

interface ToolCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  tag?: string;
}

export default function ToolCard({
  href,
  icon,
  title,
  description,
  tag,
}: ToolCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/50 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#9ED0FF]/40 hover:bg-[#0B3A5A]/80 hover:shadow-xl hover:shadow-[#9ED0FF]/5"
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#9ED0FF]/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative flex items-start justify-between gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#9ED0FF]/20 bg-[#9ED0FF]/10 transition-colors duration-300 group-hover:border-[#9ED0FF]/40 group-hover:bg-[#9ED0FF]/20">
          {icon}
        </span>
        {tag ? (
          <span className="rounded-full border border-[#9ED0FF]/20 bg-[#9ED0FF]/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#9ED0FF]/70">
            {tag}
          </span>
        ) : null}
      </div>

      <p className="relative mt-5 flex items-center gap-1.5 text-base font-semibold tracking-tight text-[#C9E4FF] transition-colors group-hover:text-white">
        {title}
        <ArrowUpRightIcon className="h-4 w-4 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
      </p>
      <p className="relative mt-2 text-sm leading-6 text-[#9ED0FF]/60">
        {description}
      </p>
    </Link>
  );
}
