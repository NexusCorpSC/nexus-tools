import Link from "next/link";

interface NexusLinkButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "ghost";
  className?: string;
}

export default function LinkButton({
  href,
  children,
  variant = "primary",
  className,
}: NexusLinkButtonProps) {
  const base = "rounded-lg px-6 py-3 text-sm font-semibold transition-colors";

  const variants = {
    primary:
      "bg-[#9ED0FF] text-[#092F49] shadow-lg shadow-[#9ED0FF]/20 hover:bg-[#CCE7FF]",
    ghost:
      "border border-[#9ED0FF]/30 bg-[#9ED0FF]/10 text-[#C9E4FF] hover:bg-[#9ED0FF]/20 backdrop-blur-sm",
  };

  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className ?? ""}`}>
      {children}
    </Link>
  );
}
