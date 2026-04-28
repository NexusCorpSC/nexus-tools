export default function GlowBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-[#9ED0FF]/10 blur-3xl" />
      <div className="absolute top-1/3 -left-40 h-[400px] w-[600px] rounded-full bg-[#CCE7FF]/5 blur-3xl" />
      <div className="absolute top-1/2 -right-40 h-[400px] w-[600px] rounded-full bg-[#9ED0FF]/5 blur-3xl" />
    </div>
  );
}
