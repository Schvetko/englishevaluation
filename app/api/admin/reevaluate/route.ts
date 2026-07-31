import { NextRequest, NextResponse } from "next/server";
import { listAssessments, saveAssessment } from "@/lib/db";
import { runEvaluation } from "@/lib/evaluate";
import { ADMIN_COOKIE, isValidAdminCookie } from "@/lib/auth";
import { hasCurrentRubric } from "@/lib/scoring";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isValidAdminCookie(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is not configured: ANTHROPIC_API_KEY is missing" },
      { status: 500 },
    );
  }

  const all = await listAssessments();
  const stale = all.filter((record) => !hasCurrentRubric(record.evaluation));

  if (stale.length === 0) {
    return NextResponse.json({ updated: 0, failed: [] });
  }

  // Run concurrently — each record's evaluation is an independent Anthropic
  // call, and this route has a limited execution window.
  const results = await Promise.allSettled(
    stale.map(async (record) => {
      const evaluation = await runEvaluation({
        question1: record.question1,
        question2: record.question2,
        transcript1: record.transcript1,
        transcript2: record.transcript2,
        followupQuestion: record.followupQuestion || undefined,
        followupTranscript: record.followupTranscript || undefined,
        followupReplayed: record.followupReplayed,
      });
      await saveAssessment({ ...record, evaluation });
      return record.id;
    }),
  );

  const updated = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .map((r, i) =>
      r.status === "rejected"
        ? { id: stale[i].id, error: String(r.reason) }
        : null,
    )
    .filter((x): x is { id: string; error: string } => x !== null);

  return NextResponse.json({ updated, failed });
}
