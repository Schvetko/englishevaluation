import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { saveAssessment } from "@/lib/db";
import type { AssessmentRecord, Evaluation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCORE = { type: "integer", enum: [1, 2, 3, 4, 5] } as const;

const SCORED_CRITERION = {
  type: "object",
  additionalProperties: false,
  required: ["score", "comment"],
  properties: { score: SCORE, comment: { type: "string" } },
} as const;

const EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "comprehension",
    "fluency",
    "grammar",
    "technical_vocabulary",
    "spontaneous_followup",
    "everyday_technical_gap",
    "overall_band",
    "observations",
  ],
  properties: {
    comprehension: SCORED_CRITERION,
    fluency: SCORED_CRITERION,
    grammar: {
      type: "object",
      additionalProperties: false,
      required: ["score", "comment", "examples"],
      properties: {
        score: SCORE,
        comment: { type: "string" },
        examples: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["original", "correction"],
            properties: {
              original: { type: "string" },
              correction: { type: "string" },
            },
          },
        },
      },
    },
    technical_vocabulary: SCORED_CRITERION,
    spontaneous_followup: {
      anyOf: [SCORED_CRITERION, { type: "null" }],
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
  },
} as const;

const SYSTEM_PROMPT = `You are an experienced English language assessor specialising in evaluating spoken English of IT professionals for hiring purposes. You receive automatic speech-to-text transcripts of spoken answers, so ignore punctuation/casing issues and obvious transcription artifacts (e.g. a dropped article or verb ending, words merged or split oddly, a mis-heard homophone) — these are recognition noise, not the candidate's grammar. Only count an error as a grammar mistake if it reflects the candidate's actual language production, not a plausible transcription slip.

Evaluate against a workplace-communication rubric:
- comprehension (1-5): did the candidate understand the question and answer it relevantly and completely?
- production/fluency (1-5): sentence construction, connected speech, self-correction, hesitation patterns visible in the transcript, range of structures. Do NOT factor grammatical accuracy into this score — that is scored separately below.
- grammar (1-5): grammatical range and accuracy across BOTH main answers (tense, agreement, articles, word order, prepositions, sentence structure). Score purely on grammar, independent of fluency or vocabulary. In "examples" (0-3 items), quote short real fragments from the transcripts that are genuine grammar mistakes (not transcription artifacts) with a natural corrected version. If there are no real grammar mistakes worth noting, return an empty examples array and say so in the comment.
- technical_vocabulary (1-5): ONLY based on answer 1 (the technical question) — precision and range of technical/domain vocabulary, ability to explain technical concepts clearly.
- spontaneous_followup (1-5, or null): the candidate was asked one unscripted follow-up question with no preparation time, testing genuine real-time comprehension and response versus a prepared/rehearsed answer. Score how well they understood the follow-up and responded relevantly and coherently on the spot. Set to null (not 1) ONLY if no follow-up question/answer was provided at all — if a follow-up was asked but the candidate answered poorly, empty, or off-topic, score it low (1-2) rather than null.
- everyday_technical_gap: compare fluency/complexity between answer 2 (everyday topic) and answer 1 (technical topic). "none" = comparable quality; "moderate" = noticeably weaker on technical content; "significant" = the candidate is markedly less capable on technical content than in general conversation (or vice versa — note the direction in the comment).
- overall_band: "independent" = can work in an English-speaking team without language support; "supported" = can work but will need occasional help/patience (e.g. in meetings); "needs_support" = language is currently a blocker for team communication. Weigh the spontaneous follow-up response heavily here — it is the strongest signal of real unscripted ability.
- observations: 2-3 specific, concrete remarks citing actual phrases from the transcripts (strengths and weaknesses), distinct from the grammar examples.

If an answer is empty or extremely short, score the affected criteria 1 and say so plainly. Write all comments in English, concise and specific.`;

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

  const hasFollowup = Boolean(body.followupQuestion);

  const userPrompt = [
    "Evaluate this candidate's spoken English.",
    "",
    "=== QUESTION 1 (technical) ===",
    body.question1,
    "",
    "=== ANSWER 1 (speech-to-text transcript) ===",
    body.transcript1?.trim() || "(empty answer)",
    "",
    ...(hasFollowup
      ? [
          "=== UNSCRIPTED FOLLOW-UP QUESTION (asked immediately after answer 1, no preparation time) ===",
          body.followupQuestion,
          "",
          "=== FOLLOW-UP ANSWER (speech-to-text transcript) ===",
          body.followupTranscript?.trim() || "(empty answer)",
          "",
        ]
      : ["=== No follow-up question was asked in this session ===", ""]),
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
    followupQuestion: body.followupQuestion || "",
    followupTranscript: body.followupTranscript || "",
    followupDurationSeconds: body.followupDurationSeconds ?? 0,
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
