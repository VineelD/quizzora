import { NextResponse } from "next/server";
import { EDUCATOR_ROLES, requireApiSession } from "../../../../../lib/auth.js";
import { importStudentsFromCsv } from "../../../../../lib/db.js";

export const runtime = "nodejs";

function parseCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one student.");
  }

  const headers = lines[0].split(",").map((item) => item.trim().toLowerCase());
  const index = (name) => headers.indexOf(name);

  const required = ["name", "username", "email", "password"];
  for (const column of required) {
    if (index(column) === -1) {
      throw new Error(`CSV header must include: ${required.join(", ")}`);
    }
  }

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((item) => item.trim());
    return {
      name: cells[index("name")],
      username: cells[index("username")],
      email: cells[index("email")],
      password: cells[index("password")],
      yearLevel: index("yearlevel") >= 0 ? cells[index("yearlevel")] : index("year_level") >= 0 ? cells[index("year_level")] : "Year 7",
      guardianEmail: index("guardianemail") >= 0 ? cells[index("guardianemail")] : index("guardian_email") >= 0 ? cells[index("guardian_email")] : "",
      learningNeeds: index("learningneeds") >= 0 ? cells[index("learningneeds")] : index("learning_needs") >= 0 ? cells[index("learning_needs")] : "",
    };
  });
}

export async function POST(request) {
  const session = await requireApiSession(EDUCATOR_ROLES, { feature: "csvImport" });
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const body = await request.json();
  try {
    const rows = parseCsv(body.csv);
    const result = importStudentsFromCsv({ teacherId: session.user.id, rows });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
