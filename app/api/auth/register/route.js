import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Use school registration: create a new school or join with your school code from the sign-in page.",
    },
    { status: 400 },
  );
}