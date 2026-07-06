import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { saveAssessment } from "@/lib/db";
import type { AssessmentRecord, Evaluation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCORE = { type: "integer", enum: [1, 2, 3, 4, 5] } as const;

const EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "comprehension",
    "fluency",
    "technical_vocabulary",
    "everyday_technical_gap",
    "overall_band",
    "observations",
    "reformulation_example",
  ],
  properties: {
    comprehension: {
      type: "object",
      additionalProperties: false,
      required: ["score", "comment"],
      properties: { score: SCORE, comment: { type: "string" } },
    },
    fluency: {
      type: "object",
      additionalProperties: false,
      required: ["score", "comment"],
      properties: { score: SCORE, comment: { type: "string" } },
    },
    technical_vocabulary: {
      type: "object",
      additionalProperties: false,
      required: ["score", "comment"],
      properties: { score: SCORE, comment: { type: "string" } },
    },
    everyday_technical_gap: {
      type: "object",
      additionalProperties: false,
      required: ["gap", "comment"],
      properties: {
        gap: { type: "string", enum: ["none", "moderate", "significant"] },
        comment: { type: "string" },
      },
    },
    overall_band: {
      type: "string",
      enum: ["independent", "supported", "needs_support"],
    },
    observations: { type: "array", items: { type: "string" } },
    reformulation_example: {
      type: "object",
      additionalProperties: false,
      required: ["original", "improved"],
      properties: {
        original: { type: "string" },
        improved: { type: "string" },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are an experienced English language assessor specialising in evaluating spoken English of IT professionals for hiring purposes. You receive automatic speech-to-text transcripts of two spoken answers, so ignore punctuation/casing issues and obvious transcription artifacts — judge the underlying language production, not the transcription quality.

Evaluate against a workplace-communication rubric:
- comprehension (1-5): did the candidate understand the question and answer it relevantly and completely?
- production/fluency (1-5): sentence construction, connected speech, self-correction, hesitation patterns visible in the transcript, grammatical control, range of structures.
- technical_vocabulary (1-5): ONLY based on answer 1 (the technical question) — precision and range of technical/domain vocabulary, ability to explain technical concepts clearly.
- everyday_technical_gap: compare fluency/complexity between answer 2 (everyday topic) and answer 1 (technical topic). "none" = comparable quality; "moderate" = noticeably weaker on technical content; "significant" = the candidate is markedly less capable on technical content than in general conversation (or vice versa — note the direction in the comment).
- overall_band: "independent" = can work in an English-speaking team without language support; "supported" = can work but will need occasional help/patience (e.g. in meetings); "needs_support" = language is currently a blocker for team communication.
- observations: 2-3 specific, concrete remarks citing actual phrases from the transcripts (strengths and weaknesses).
- reformulation_example: pick ONE real sentence from the transcripts that is awkward or incorrect ("original") and show a natural, professional way to say it ("improved"). If the transcripts are too short or empty, use an empty string for both.

If an answer is empty or extremely short, score the affected criteria 1 and say so plainly. Write all comments in English, concise and specific.`;

interface EvaluateRequestBody {
  candidateName: string;
  question1: string;
  question2: string;
  transcript1: string;
  transcript2: string;
  duration1Seconds?: number;
  duration2Seconds?: number;
  answerMode1?: "voice" | "text";
  answerMode2?: "voice" | "text";
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

  const userPrompt = [
    "Evaluate this candidate's spoken English.",
    "",
    "=== QUESTION 1 (technical) ===",
    body.question1,
    "",
    "=== ANSWER 1 (speech-to-text transcript) ===",
    body.transcript1?.trim() || "(empty answer)",
    "",
    "=== QUESTION 2 (everyday) ===",
    body.question2,
    "",
    "=== ANSWER 2 (speech-to-text transcript) ===",
    body.transcript2?.trim() || "(empty answer)",
  ].join("\n");

  let evaluation: Evaluation;
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: EVALUATION_SCHEMA },
      },
      messages: [{ role: "user", content: userPrompt }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "Evaluation was declined by the model" },
        { status: 502 },
      );
    }

    const textBlock = response.content.find(
      (block) => block.type === "text",
    ) as { type: "text"; text: string } | undefined;
    if (!textBlock) {
      return NextResponse.json(
        { error: "Model returned no text output" },
        { status: 502 },
      );
    }
    evaluation = JSON.parse(textBlock.text) as Evaluation;
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
    answerMode1: body.answerMode1 ?? "voice",
    answerMode2: body.answerMode2 ?? "voice",
    videoUrls: Array.isArray(body.videoUrls) ? body.videoUrls : [],
    evaluation,
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
        band: record.evaluation.overall_band,
        videoUrls: record.videoUrls,
        createdAt: record.createdAt,
      }),
    }).catch((err) => console.error("talent-flow webhook failed:", err));
  }

  return NextResponse.json({ id: record.id });
}
