import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveAssessment } from "@/lib/db";
import { runEvaluation } from "@/lib/evaluate";
import type { AssessmentRecord, Evaluation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface EvaluateRequestBody {
  candidateName: string;
  question1: string;
  question2: string;
  transcript1: string;
  transcript2: string;
  duration1Seconds?: number;
  duration2Seconds?: number;
  followupQuestion?: string;
  followupTranscript?: string;
  followupDurationSeconds?: number;
  followupReplayed?: boolean;
  videoUrls?: string[];
}

export async function POST(request: NextRequest) {
  let body: EvaluateRequestBody;
  try {
    body = (await request.json()) as EvaluateRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const candidateName = (body.candidateName || "").trim();
  if (!candidateName) {
    return NextResponse.json(
      { error: "candidateName is required" },
      { status: 400 },
    );
  }
  if (!body.question1 || !body.question2) {
    return NextResponse.json(
      { error: "question1 and question2 are required" },
      { status: 400 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is not configured: ANTHROPIC_API_KEY is missing" },
      { status: 500 },
    );
  }

  let evaluation: Evaluation;
  try {
    evaluation = await runEvaluation({
      question1: body.question1,
      question2: body.question2,
      transcript1: body.transcript1,
      transcript2: body.transcript2,
      followupQuestion: body.followupQuestion,
      followupTranscript: body.followupTranscript,
      followupReplayed: body.followupReplayed,
    });
  } catch (err) {
    console.error("Anthropic evaluation failed:", err);
    return NextResponse.json(
      { error: "Evaluation failed, please try again" },
      { status: 502 },
    );
  }

  const record: AssessmentRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    candidateName,
    question1: body.question1,
    question2: body.question2,
    transcript1: body.transcript1 || "",
    transcript2: body.transcript2 || "",
    duration1Seconds: body.duration1Seconds ?? 0,
    duration2Seconds: body.duration2Seconds ?? 0,
    followupQuestion: body.followupQuestion || "",
    followupTranscript: body.followupTranscript || "",
    followupDurationSeconds: body.followupDurationSeconds ?? 0,
    followupReplayed: Boolean(body.followupReplayed),
    videoUrls: Array.isArray(body.videoUrls) ? body.videoUrls : [],
    evaluation,
    pronunciationScore: null,
  };

  try {
    await saveAssessment(record);
  } catch (err) {
    console.error("Failed to save assessment:", err);
    return NextResponse.json(
      { error: "Failed to save the result to the database" },
      { status: 500 },
    );
  }

  // Best-effort notification to the external candidate database (talent-flow).
  const webhook = process.env.TALENT_FLOW_WEBHOOK_URL;
  if (webhook) {
    const origin = request.nextUrl.origin;
    fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.TALENT_FLOW_API_KEY
          ? { Authorization: `Bearer ${process.env.TALENT_FLOW_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        source: "english-assessment",
        candidateName: record.candidateName,
        assessmentId: record.id,
        resultUrl: `${origin}/results/${record.id}`,
        videoUrls: record.videoUrls,
        createdAt: record.createdAt,
      }),
    }).catch((err) => console.error("talent-flow webhook failed:", err));
  }

  return NextResponse.json({ id: record.id });
}
