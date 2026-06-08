import { createHash } from "node:crypto";
import { getDb } from "./db.js";
import { saveQuestionImage } from "./question-images.js";

export function diagramImageCacheEnabled() {
  return process.env.DIAGRAM_IMAGE_CACHE !== "false";
}

export function hashDiagramPrompt(prompt) {
  return createHash("sha256").update(String(prompt || "")).digest("hex");
}

export function getCachedDiagramImageUrl(prompt) {
  if (!diagramImageCacheEnabled()) {
    return null;
  }

  const hash = hashDiagramPrompt(prompt);
  const row = getDb()
    .prepare("SELECT image_id FROM diagram_image_cache WHERE prompt_hash = ?")
    .get(hash);

  if (!row?.image_id) {
    return null;
  }

  return `/api/quiz-media/${row.image_id}`;
}

export function cacheDiagramImage(prompt, buffer, extension = "png") {
  const imageUrl = saveQuestionImage(buffer, extension);
  if (!diagramImageCacheEnabled()) {
    return imageUrl;
  }

  const hash = hashDiagramPrompt(prompt);
  const imageId = Number(String(imageUrl).split("/").pop());
  if (!Number.isFinite(imageId)) {
    return imageUrl;
  }

  getDb()
    .prepare(
      `
      INSERT INTO diagram_image_cache (prompt_hash, image_id)
      VALUES (?, ?)
      ON CONFLICT(prompt_hash) DO NOTHING
    `,
    )
    .run(hash, imageId);

  return getCachedDiagramImageUrl(prompt) || imageUrl;
}
