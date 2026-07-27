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
import { MAX_SHIP_CAPACITY, MAX_SHIP_NAME_LENGTH } from "@/lib/cargo";
import type { CargoShip } from "@/lib/cargo-ships";
import {
  addCargoShip,
  editCargoShip,
  importDefaultCargoShips,
  removeCargoShip,
} from "../actions";

interface ShipsManagerProps {
  ships: CargoShip[];
  /** True while the cargo page still falls back to the built-in ships. */
  usesDefaults: boolean;
}

export default function ShipsManager({
  ships,
  usesDefaults,
}: ShipsManagerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editing, setEditing] = useState<CargoShip | null>(null);
  const [deleting, setDeleting] = useState<CargoShip | null>(null);

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsSubmitting(true);

    try {
      await addCargoShip(new FormData(form));
      form.reset();
      toast.success("Vaisseau ajouté", {
        description: "Il est désormais proposé sur la feuille de route cargo.",
      });
    } catch (error) {
      toast.error("Ajout impossible", {
        description:
          error instanceof Error ? error.message : "Une erreur est survenue.",
      });
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
    formData.set("shipId", editing.id);
    setIsSubmitting(true);

    try {
      await editCargoShip(formData);
      setEditing(null);
      toast.success("Vaisseau mis à jour");
    } catch (error) {
      toast.error("Mise à jour impossible", {
        description:
          error instanceof Error ? error.message : "Une erreur est survenue.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(ship: CargoShip) {
    setIsSubmitting(true);

    try {
      await removeCargoShip(ship.id);
      setDeleting(null);
      toast.success("Vaisseau supprimé", {
        description: `${ship.name} n'est plus proposé sur la feuille de route.`,
      });
    } catch (error) {
      toast.error("Suppression impossible", {
        description:
          error instanceof Error ? error.message : "Une erreur est survenue.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleImportDefaults() {
    setIsSubmitting(true);

    try {
      const { imported } = await importDefaultCargoShips();
      toast.success(
        imported > 0
          ? `${imported} vaisseau${imported > 1 ? "x" : ""} importé${imported > 1 ? "s" : ""}`
          : "Rien à importer",
        {
          description:
            imported > 0
              ? "Les vaisseaux par défaut sont maintenant modifiables."
              : "Les vaisseaux par défaut sont déjà enregistrés.",
        },
      );
    } catch (error) {
      toast.error("Import impossible", {
        description:
          error instanceof Error ? error.message : "Une erreur est survenue.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#CCE7FF]">
          Ajouter un vaisseau
        </h2>

        <form onSubmit={handleAdd} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1">
              <Label htmlFor="ship-name">Nom</Label>
              <Input
                id="ship-name"
                name="name"
                required
                maxLength={MAX_SHIP_NAME_LENGTH}
                placeholder="ex. Hull C"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="ship-capacity">Capacité (SCU)</Label>
              <Input
                id="ship-capacity"
                name="capacity"
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={MAX_SHIP_CAPACITY}
                step={1}
                placeholder="4608"
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
            Vaisseaux enregistrés
          </h2>

          <Button
            type="button"
            variant="outline"
            onClick={handleImportDefaults}
            disabled={isSubmitting}
          >
            Importer les vaisseaux par défaut
          </Button>
        </div>

        {usesDefaults && (
          <p className="rounded-lg border border-[#9ED0FF]/20 bg-[#0B3A5A]/40 px-3 py-2 text-sm text-[#9ED0FF]/80">
            Aucun vaisseau enregistré : la feuille de route propose pour
            l&apos;instant la liste par défaut (Hull B, Railen, Ironclad).
            Ajoutez un vaisseau ou importez la liste par défaut pour la gérer
            ici.
          </p>
        )}

        {ships.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#9ED0FF]/70">
            Aucun vaisseau enregistré pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-[#9ED0FF]/10 rounded-lg border border-[#9ED0FF]/15">
            {ships.map((ship) => (
              <li
                key={ship.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#CCE7FF]">
                    {ship.name}
                  </p>
                  <p className="text-xs text-[#9ED0FF]/60">
                    {ship.capacity} SCU · id {ship.id}
                  </p>
                </div>

                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Modifier ${ship.name}`}
                    title="Modifier"
                    onClick={() => setEditing(ship)}
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Supprimer ${ship.name}`}
                    title="Supprimer"
                    onClick={() => setDeleting(ship)}
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
            <DialogTitle>Modifier le vaisseau</DialogTitle>
            <DialogDescription>
              L&apos;identifiant ({editing?.id}) ne change pas : les feuilles de
              route déjà enregistrées dans les navigateurs continuent de pointer
              sur ce vaisseau.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="edit-ship-name">Nom</Label>
                <Input
                  id="edit-ship-name"
                  name="name"
                  required
                  maxLength={MAX_SHIP_NAME_LENGTH}
                  defaultValue={editing.name}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-ship-capacity">Capacité (SCU)</Label>
                <Input
                  id="edit-ship-capacity"
                  name="capacity"
                  type="number"
                  inputMode="numeric"
                  required
                  min={1}
                  max={MAX_SHIP_CAPACITY}
                  step={1}
                  defaultValue={editing.capacity}
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
              Le vaisseau ne sera plus proposé sur la feuille de route cargo.
              Les feuilles de route qui l&apos;avaient sélectionné basculeront
              sur le premier vaisseau disponible.
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
