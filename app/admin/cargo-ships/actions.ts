"use server";

import Ajv from "ajv";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions";
import {
  createCargoShip,
  deleteCargoShip,
  seedDefaultCargoShips,
  updateCargoShip,
} from "@/lib/cargo-ships";
import { MAX_SHIP_CAPACITY, MAX_SHIP_NAME_LENGTH } from "@/lib/cargo";

const ajv = new Ajv({ coerceTypes: true });

const validateShip = ajv.compile({
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: MAX_SHIP_NAME_LENGTH },
    capacity: { type: "integer", minimum: 1, maximum: MAX_SHIP_CAPACITY },
  },
  required: ["name", "capacity"],
});

function readShipForm(formData: FormData): {
  name: string;
  capacity: number;
} {
  // Ajv coerces the form string into a number in place.
  const ship: Record<string, unknown> = {
    name: (formData.get("name") as string | null)?.trim() ?? "",
    capacity: formData.get("capacity"),
  };

  if (!validateShip(ship)) {
    console.warn({
      errors: validateShip.errors,
      message: "Invalid cargo ship data",
    });
    throw new Error("Données de vaisseau invalides");
  }

  const { name, capacity } = ship as { name: string; capacity: number };

  return { name, capacity };
}

function revalidateCargo() {
  revalidatePath("/admin/cargo-ships");
  revalidatePath("/industry/cargo");
}

export async function addCargoShip(formData: FormData) {
  await requireAdmin();

  const ship = await createCargoShip(readShipForm(formData));
  revalidateCargo();

  return { success: true, shipId: ship.id };
}

export async function editCargoShip(formData: FormData) {
  await requireAdmin();

  const id = formData.get("shipId");
  if (typeof id !== "string" || !id) {
    throw new Error("Identifiant de vaisseau manquant");
  }

  await updateCargoShip(id, readShipForm(formData));
  revalidateCargo();

  return { success: true };
}

export async function removeCargoShip(id: string) {
  await requireAdmin();

  await deleteCargoShip(id);
  revalidateCargo();

  return { success: true };
}

export async function importDefaultCargoShips() {
  await requireAdmin();

  const imported = await seedDefaultCargoShips();
  revalidateCargo();

  return { success: true, imported };
}
