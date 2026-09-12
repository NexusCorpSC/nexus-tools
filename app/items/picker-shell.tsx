"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PHONE_QUERY, useMediaQuery } from "./use-media-query";

/**
 * Le contenant d'un sélecteur d'objets — celui de la fiche et celui du
 * comparateur — qui change de nature selon l'écran.
 *
 * Sur un téléphone, une bulle accrochée à son bouton ne tient pas : dès que le
 * clavier s'ouvre, elle dépasse de l'écran, la page ne défile pas sous elle
 * (toucher à côté la referme) et son bouton d'action devient inatteignable.
 * Elle devient donc une feuille montée du bas, dont la liste occupe la hauteur
 * restante et défile seule, le pied restant visible clavier ouvert.
 *
 * Sur un écran plus large, la bulle est gardée mais bornée à la hauteur
 * disponible sous son bouton, pour la même raison : ce qui dépasse de la
 * fenêtre n'est pas atteignable.
 *
 * Le contenu est une colonne flex : la liste y porte `min-h-0 flex-1
 * overflow-y-auto`, et c'est elle, jamais le contenant, qui défile.
 */
export function PickerShell({
  open,
  onOpenChange,
  title,
  trigger,
  align = "end",
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lu par les lecteurs d'écran ; le contenu porte son propre en-tête. */
  title: string;
  trigger: ReactNode;
  align?: "start" | "center" | "end";
  /** La largeur de la bulle, sur grand écran. */
  className?: string;
  children: ReactNode;
}) {
  const phone = useMediaQuery(PHONE_QUERY);

  if (phone) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          // L'en-tête du contenu tient lieu de description ; sans ceci Radix
          // réclame une description séparée à chaque ouverture.
          aria-describedby={undefined}
          className={cn(
            "top-auto bottom-0 flex max-h-[85dvh] w-full max-w-none translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none border-[#9ED0FF]/20 bg-[#0B3A5A] p-3 pt-4",
            "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-left-0 data-[state=closed]:slide-out-to-left-0 data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-top-0",
          )}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <span
            aria-hidden="true"
            className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[#9ED0FF]/30"
          />
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align={align}
        collisionPadding={16}
        className={cn(
          "flex max-h-[min(36rem,var(--radix-popover-content-available-height))] flex-col p-3",
          className,
        )}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
