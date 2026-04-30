import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { registerDiscordCommands } from "./actions";

export const metadata: Metadata = {
  title: "Admin — Discord",
  description: "Administration des commandes Discord Nexus Tools.",
  robots: { index: false, follow: false },
};

export default function AdminDiscordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 text-center shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="mb-4 text-2xl font-bold text-[#CCE7FF]">Discord</h1>
        <p className="mb-6 text-[#9ED0FF]/70">
          Administration des commandes Discord Nexus Tools.
        </p>
        <Button onClick={registerDiscordCommands}>Update commands</Button>
      </div>
    </div>
  );
}
