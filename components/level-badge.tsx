import { cn } from "@/lib/utils";

/** Les teintes des niveaux : du bleu de la Recrue à l'or du Pilier. */
const TONES: Record<number, string> = {
  1: "border-[#9ED0FF]/40 text-[#BFE0FF]",
  2: "border-[#9ED0FF]/60 text-[#CFE8FF]",
  3: "border-[#F5C46B]/60 text-[#F7D68F]",
  4: "border-[#F5C46B]/60 bg-[#F5C46B]/14 text-[#F7D68F]",
  5: "border-[#F5C46B] bg-[#F5C46B] text-[#2A1A02]",
};

/**
 * La pastille de niveau, à côté d'un pseudo : « N2 », et le nom du niveau
 * quand il y a la place.
 */
export function LevelBadge({
  level,
  name,
  className,
}: {
  level: number;
  name?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center gap-1.5 rounded-[5px] border px-1.5 font-mono text-[10px] font-bold",
        TONES[level] ?? TONES[1],
        className,
      )}
    >
      N{level}
      {name && <span className="font-sans font-semibold">{name}</span>}
    </span>
  );
}
