"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** The one interactive thing on a sheet of paper. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer />
      {label}
    </Button>
  );
}
