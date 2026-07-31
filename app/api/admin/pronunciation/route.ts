import { NextRequest, NextResponse } from "next/server";
import { setPronunciationScore } from "@/lib/db";
import { ADMIN_COOKIE, isValidAdminCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isValidAdminCookie(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { id?: string; score?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const score = body.score;
  if (score !== null && (typeof score !== "number" || score < 1 || score > 5)) {
    return NextResponse.json(
      { error: "score must be an integer 1-5 or null" },
      { status: 400 },
    );
  }

  const updated = await setPronunciationScore(
    body.id,
    score as 1 | 2 | 3 | 4 | 5 | null,
  );
  if (!updated) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
