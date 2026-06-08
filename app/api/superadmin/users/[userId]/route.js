import { NextResponse } from "next/server";
import { requireApiSession } from "../../../../../lib/auth.js";
import { deleteManagedUser, getManagedUserById, updateManagedUser } from "../../../../../lib/superadmin.js";

export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await params;
  const user = getManagedUserById(Number(userId));
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ user });
}

export async function PATCH(request, { params }) {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await params;
  const body = await request.json();

  try {
    const user = updateManagedUser({
      actorId: auth.user.id,
      userId: Number(userId),
      schoolId: body.schoolId,
      familyId: body.familyId,
      role: body.role,
      name: body.name,
      email: body.email,
      username: body.username,
      password: body.password,
    });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(_request, { params }) {
  const auth = await requireApiSession("superadmin", { skipBilling: true });
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { userId } = await params;
  try {
    const result = deleteManagedUser({
      actorId: auth.user.id,
      userId: Number(userId),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
