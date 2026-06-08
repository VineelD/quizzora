import { insertQuizImage } from "./db.js";

const extensionContentTypes = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function contentTypeForExtension(extension = "png") {
  return extensionContentTypes[String(extension).toLowerCase()] || "application/octet-stream";
}

export function saveQuestionImage(buffer, extension = "png") {
  const imageId = insertQuizImage(buffer, contentTypeForExtension(extension));
  return `/api/quiz-media/${imageId}`;
}

export function saveCoachMedia(buffer, contentType = "audio/mpeg") {
  const mediaId = insertQuizImage(buffer, contentType);
  return `/api/quiz-media/${mediaId}`;
}

export async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download generated image (${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
