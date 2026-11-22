"use server";

import Ajv from "ajv";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/permissions";
import {
  createRadarSignature,
  deleteRadarSignature,
  seedDefaultRadarSignatures,
  updateRadarSignature,
  type RadarSignatureInput,
} from "@/lib/radar-signatures";
import {
  MAX_RADAR_NAME_LENGTH,
  MAX_RADAR_VALUE,
  RADAR_CATEGORIES,
} from "@/lib/radar";

const ajv = new Ajv({ coerceTypes: true });

const validateSignature = ajv.compile({
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 1, maxLength: MAX_RADAR_NAME_LENGTH },
    category: { type: "string", enum: [...RADAR_CATEGORIES] },
    value: { type: "integer", minimum: 1, maximum: MAX_RADAR_VALUE },
  },
  required: ["name", "category", "value"],
});

function readSignatureForm(formData: FormData): RadarSignatureInput {
  // Une requête forgée peut envoyer un File pour n'importe quel champ : rien
  // n'est rogné avant d'avoir vérifié que c'est bien du texte.
  const rawName = formData.get("name");

  const signature: Record<string, unknown> = {
    name: typeof rawName === "string" ? rawName.trim() : rawName,
    category: formData.get("category"),
    value: formData.get("value"),
  };

  if (!validateSignature(signature)) {
    console.warn({
      errors: validateSignature.errors,
      message: "Invalid radar signature data",
    });
    throw new Error("Données de signature invalides");
  }

  return signature as unknown as RadarSignatureInput;
}

function revalidateRadar() {
  revalidatePath("/admin/radar-signatures");
  revalidatePath("/industry/radar");
}

export async function addRadarSignature(formData: FormData) {
  await requireAdmin();

  const signature = await createRadarSignature(readSignatureForm(formData));
  revalidateRadar();

  return { success: true, signatureId: signature.id };
}

export async function editRadarSignature(formData: FormData) {
  await requireAdmin();

  const id = formData.get("signatureId");
  if (typeof id !== "string" || !id) {
    throw new Error("Identifiant de signature manquant");
  }

  await updateRadarSignature(id, readSignatureForm(formData));
  revalidateRadar();

  return { success: true };
}

export async function removeRadarSignature(id: unknown) {
  await requireAdmin();

  // Une action serveur reçoit n'importe quelle valeur sérialisable : un objet
  // ici deviendrait un filtre Mongo.
  if (typeof id !== "string" || !id) {
    throw new Error("Identifiant de signature manquant");
  }

  await deleteRadarSignature(id);
  revalidateRadar();

  return { success: true };
}

export async function importDefaultRadarSignatures() {
  await requireAdmin();

  const imported = await seedDefaultRadarSignatures();
  revalidateRadar();

  return { success: true, imported };
}
