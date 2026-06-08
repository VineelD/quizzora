import { NextResponse } from "next/server";
import { getQuizImage } from "../../../../lib/db.js";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const { imageId: rawImageId } = await params;
  const imageId = Number(String(rawImageId).replace(/\.[a-z0-9]+$/i, ""));
  if (!Number.isInteger(imageId) || imageId <= 0) {
    return NextResponse.json({ error: "Invalid image id." }, { status: 400 });
  }

  const image = getQuizImage(imageId);
  if (!image) {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  return new NextResponse(image.imageData, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
