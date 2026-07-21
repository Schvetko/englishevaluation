import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are simulating a foreign client or technical stakeholder on a live call with a candidate who just answered a question about their work. Your job is to ask ONE short, natural spoken follow-up question — the kind a real person would ask on the spot, not an interviewer's script.

Rules:
- Base the question on a SPECIFIC detail the candidate actually mentioned in their answer (a technology, a decision, a number, a consequence). Reference it concretely.
- Keep it short — one sentence, conversational spoken English, the way someone would ask on a call ("Wait, why didn't you just...", "How long did that take to fix?", "What would you do differently now?").
- It should require the candidate to think and respond immediately, without prepared notes — test genuine understanding of what they just said, not new knowledge.
- Do not ask something the candidate already fully answered. Do not ask multiple questions.
- If the answer was empty, extremely short, or too vague to reference anything specific, ask a generic but still concrete clarifying question about the original topic (e.g. "Can you give a specific example of that?").
- Output ONLY the question text, nothing else — no quotes, no preamble.`;

export async function POST(request: NextRequest) {
  let body: { question: string; transcript: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is not configured: ANTHROPIC_API_KEY is missing" },
      { status: 500 },
    );
  }

  const userPrompt = [
    "Original question asked to the candidate:",
    body.question,
    "",
    "Candidate's spoken answer (speech-to-text transcript, may contain minor recognition errors):",
    body.transcript?.trim() || "(the candidate gave no answer)",
    "",
    "Ask your one follow-up question now.",
  ].join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "Follow-up generation was declined" },
        { status: 502 },
      );
    }

    const textBlock = response.content.find((b) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    const question = textBlock?.text.trim().replace(/^["“]|["”]$/g, "") || "";
    if (!question) {
      return NextResponse.json(
        { error: "Model returned no follow-up question" },
        { status: 502 },
      );
    }

    return NextResponse.json({ question });
  } catch (err) {
    console.error("Follow-up generation failed:", err);
    return NextResponse.json(
      { error: "Follow-up generation failed" },
      { status: 502 },
    );
  }
}
