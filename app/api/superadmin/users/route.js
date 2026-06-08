import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../lib/auth.js";
import { createManagedUser, listUsersAcrossSchools } from "../../../../lib/superadmin.js";

export const runtime = "nodejs";

export async function GET(request) {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const schoolId = searchParams.get("schoolId");
  const familyId = searchParams.get("familyId");
  const role = searchParams.get("role");
  const search = searchParams.get("search") || "";

  return NextResponse.json({
    users: listUsersAcrossSchools({
      schoolId: schoolId ? Number(schoolId) : null,
      familyId: familyId ? Number(familyId) : null,
      role: role || null,
      search,
    }),
  });
}

export async function POST(request) {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  try {
    const user = createManagedUser({
      actorId: auth.user.id,
      schoolId: body.schoolId,
      familyId: body.familyId,
      role: body.role,
      name: body.name,
      email: body.email,
      username: body.username,
      password: body.password,
      yearLevel: body.yearLevel,
      teacherId: body.teacherId,
    });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
