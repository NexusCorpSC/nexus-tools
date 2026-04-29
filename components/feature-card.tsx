import Link from "next/link";

interface FeatureCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
  children?: React.ReactNode;
}

export default function FeatureCard({
  href,
  icon,
  title,
  description,
  className,
  children,
}: FeatureCardProps) {
  return (
    <Link
      href={href}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 backdrop-blur-sm hover:border-[#9ED0FF]/40 hover:bg-[#0B3A5A]/80 transition-all duration-300 ${className ?? ""}`}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#9ED0FF]/5 to-transparent pointer-events-none" />
      <div className="px-8 pt-8 sm:px-10 sm:pt-10 pb-4">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#9ED0FF]/10 border border-[#9ED0FF]/20 mb-4">
          {icon}
        </span>
        <p className="text-lg font-semibold tracking-tight text-[#C9E4FF] group-hover:text-white transition-colors">
          {title}
        </p>
        <p className="mt-2 text-sm leading-6 text-[#9ED0FF]/60">{description}</p>
      </div>
      {children}
    </Link>
  );
}
