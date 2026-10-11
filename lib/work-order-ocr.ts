/**
 * La lecture par OCR d'une capture du panneau de fin d'un ordre de raffinage,
 * dans le navigateur. Le texte lu passe ensuite par `parseWorkOrderText`.
 */

import {
  parseWorkOrderText,
  type WorkOrderParseResult,
} from "@/lib/refinery-work-order";

/** Beyond this many pixels the upscaled capture only slows OCR down. */
const MAX_OCR_PIXELS = 16_000_000;

/**
 * The capture as OCR reads it best: the in-game font is small and light on a
 * dark panel, so it is enlarged up to three times, flattened on black (a PNG
 * may be transparent), turned grey and inverted into dark text on white.
 */
async function prepareCapture(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.max(
    1,
    Math.min(3, Math.sqrt(MAX_OCR_PIXELS / (bitmap.width * bitmap.height))),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Canvas 2D is not available");
  }

  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const grey =
      0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const inverted = 255 - grey;
    pixels[i] = inverted;
    pixels[i + 1] = inverted;
    pixels[i + 2] = inverted;
  }
  context.putImageData(image, 0, 0);

  return canvas;
}

/**
 * Lit la capture et en tire les lignes du panneau. `onProgress` reçoit
 * l'avancement de la reconnaissance, en pourcents.
 */
export async function readWorkOrderCapture(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<WorkOrderParseResult> {
  const capture = await prepareCapture(file);

  // Loaded on demand: the OCR engine is far too heavy for the page bundle.
  const { createWorker, PSM } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    logger: (message: { status: string; progress: number }) => {
      if (message.status === "recognizing text") {
        onProgress?.(Math.round(message.progress * 100));
      }
    },
  });

  try {
    // One uniform block: the panel is a plain table, and the automatic
    // layout splits its columns apart.
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    const { data } = await worker.recognize(capture);
    return parseWorkOrderText(data.text);
  } finally {
    await worker.terminate();
  }
}
