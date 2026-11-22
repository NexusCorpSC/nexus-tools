"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MAX_RADAR_NAME_LENGTH,
  MAX_RADAR_VALUE,
  RADAR_CATEGORIES,
  type RadarCategory,
} from "@/lib/radar";
import type { StoredRadarSignature } from "@/lib/radar-signatures";
import {
  addRadarSignature,
  editRadarSignature,
  importDefaultRadarSignatures,
  removeRadarSignature,
} from "../actions";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

const CATEGORY_LABELS: Record<RadarCategory, string> = {
  ship: "Minerai (vaisseau)",
  asteroid: "Astéroïde",
  salvage: "Récupération",
  roc: "Gisement ROC",
  fps: "Gisement à la main",
  other: "Autre",
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

function CategorySelect({
  id,
  defaultValue,
}: {
  id: string;
  defaultValue?: RadarCategory;
}) {
  return (
    <select
      id={id}
      name="category"
      required
      defaultValue={defaultValue ?? "ship"}
      className={SELECT}
    >
      {RADAR_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {CATEGORY_LABELS[category]}
        </option>
      ))}
    </select>
  );
}

interface SignaturesManagerProps {
  signatures: StoredRadarSignature[];
  /** Vrai tant que le scanner se sert de la liste par défaut. */
  usesDefaults: boolean;
}

export default function SignaturesManager({
  signatures,
  usesDefaults,
}: SignaturesManagerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editing, setEditing] = useState<StoredRadarSignature | null>(null);
  const [deleting, setDeleting] = useState<StoredRadarSignature | null>(null);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsSubmitting(true);

    try {
      await addRadarSignature(new FormData(form));
      form.reset();
      toast.success("Signature ajoutée");
    } catch (error) {
      toast.error("Ajout impossible", { description: errorText(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set("signatureId", editing.id);
    setIsSubmitting(true);

    try {
      await editRadarSignature(formData);
      setEditing(null);
      toast.success("Signature mise à jour");
    } catch (error) {
      toast.error("Mise à jour impossible", { description: errorText(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(signature: StoredRadarSignature) {
    setIsSubmitting(true);

    try {
      await removeRadarSignature(signature.id);
      setDeleting(null);
      toast.success("Signature supprimée");
    } catch (error) {
      toast.error("Suppression impossible", { description: errorText(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleImportDefaults() {
    setIsSubmitting(true);

    try {
      const { imported } = await importDefaultRadarSignatures();
      toast.success(
        imported > 0
          ? `${imported} signature${imported > 1 ? "s" : ""} importée${imported > 1 ? "s" : ""}`
          : "Rien à importer",
        {
          description:
            imported > 0
              ? "Les signatures par défaut sont maintenant modifiables."
              : "Les signatures par défaut sont déjà enregistrées.",
        },
      );
    } catch (error) {
      toast.error("Import impossible", { description: errorText(error) });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#CCE7FF]">
          Ajouter une signature
        </h2>

        <form onSubmit={handleAdd} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_1fr]">
            <div className="space-y-1">
              <Label htmlFor="signature-name">Nom</Label>
              <Input
                id="signature-name"
                name="name"
                required
                maxLength={MAX_RADAR_NAME_LENGTH}
                placeholder="ex. Quantainium"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="signature-category">Catégorie</Label>
              <CategorySelect id="signature-category" />
            </div>

            <div className="space-y-1">
              <Label htmlFor="signature-value">Signature</Label>
              <Input
                id="signature-value"
                name="value"
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={MAX_RADAR_VALUE}
                step={1}
                placeholder="3170"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              Ajouter
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[#CCE7FF]">
            Signatures enregistrées
          </h2>

          <Button
            type="button"
            variant="outline"
            onClick={handleImportDefaults}
            disabled={isSubmitting}
          >
            Importer les signatures par défaut
          </Button>
        </div>

        {usesDefaults && (
          <p className="rounded-lg border border-[#9ED0FF]/20 bg-[#0B3A5A]/40 px-3 py-2 text-sm text-[#9ED0FF]/80">
            Aucune signature enregistrée : le scanner compare pour
            l&apos;instant la liste par défaut (patch 4.10.3). Importez-la pour
            la corriger ici.
          </p>
        )}

        {signatures.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#9ED0FF]/70">
            Aucune signature enregistrée pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-[#9ED0FF]/10 rounded-lg border border-[#9ED0FF]/15">
            {signatures.map((signature) => (
              <li
                key={signature.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#CCE7FF]">
                    {signature.name}
                  </p>
                  <p className="text-xs text-[#9ED0FF]/60">
                    {signature.value} · {CATEGORY_LABELS[signature.category]} ·
                    id {signature.id}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Modifier ${signature.name}`}
                    title="Modifier"
                    onClick={() => setEditing(signature)}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Supprimer ${signature.name}`}
                    title="Supprimer"
                    onClick={() => setDeleting(signature)}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier la signature</DialogTitle>
            <DialogDescription>
              L&apos;identifiant ({editing?.id}) ne change pas.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="edit-signature-name">Nom</Label>
                <Input
                  id="edit-signature-name"
                  name="name"
                  required
                  maxLength={MAX_RADAR_NAME_LENGTH}
                  defaultValue={editing.name}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-signature-category">Catégorie</Label>
                <CategorySelect
                  id="edit-signature-category"
                  defaultValue={editing.category}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-signature-value">Signature</Label>
                <Input
                  id="edit-signature-value"
                  name="value"
                  type="number"
                  inputMode="numeric"
                  required
                  min={1}
                  max={MAX_RADAR_VALUE}
                  step={1}
                  defaultValue={editing.value}
                />
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Annuler
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  Enregistrer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer {deleting?.name} ?</DialogTitle>
            <DialogDescription>
              Le scanner ne la proposera plus. Si plus aucune signature
              n&apos;est enregistrée, il revient à la liste par défaut.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={isSubmitting}
              onClick={() => deleting && handleDelete(deleting)}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
