import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth.js";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSession();
  return NextResponse.json({ user });
}
