import { NextResponse } from "next/server";
import { getSchoolByJoinCode, getSchoolBySlug } from "../../../../lib/schools.js";

export const runtime = "nodejs";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const slug = params.get("slug");

  if (code) {
    const school = getSchoolByJoinCode(code);
    if (!school) {
      return NextResponse.json({ error: "School not found." }, { status: 404 });
    }
    return NextResponse.json({ school: { id: school.id, name: school.name, slug: school.slug } });
  }

  if (slug) {
    const school = getSchoolBySlug(slug);
    if (!school) {
      return NextResponse.json({ error: "School not found." }, { status: 404 });
    }
    return NextResponse.json({ school: { id: school.id, name: school.name, slug: school.slug } });
  }

  return NextResponse.json({ error: "Provide code or slug." }, { status: 400 });
}
