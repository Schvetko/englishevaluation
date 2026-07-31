import Anthropic from "@anthropic-ai/sdk";
import type { Evaluation } from "./types";

const SCORE = { type: "integer", enum: [1, 2, 3, 4, 5] } as const;

const SCORED_CRITERION = {
  type: "object",
  additionalProperties: false,
  required: ["score", "comment"],
  properties: { score: SCORE, comment: { type: "string" } },
} as const;

export const EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "grammar",
    "vocabulary",
    "fluency",
    "listening_comprehension",
    "communication_skills",
    "observations",
  ],
  properties: {
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
    vocabulary: SCORED_CRITERION,
    fluency: SCORED_CRITERION,
    listening_comprehension: SCORED_CRITERION,
    communication_skills: SCORED_CRITERION,
    observations: { type: "array", items: { type: "string" } },
  },
} as const;

export const EVALUATION_SYSTEM_PROMPT = `You are an experienced English language assessor specialising in evaluating spoken English of IT professionals for hiring purposes. You receive automatic speech-to-text transcripts of spoken answers, so ignore punctuation/casing issues and obvious transcription artifacts (e.g. a dropped article or verb ending, words merged or split oddly, a mis-heard homophone) — these are recognition noise, not the candidate's language ability. Only count something as a real mistake if it reflects the candidate's actual language production, not a plausible transcription slip.

You are told whether the candidate needed to replay the unscripted follow-up question before answering it (this is a concrete listening-comprehension signal, similar to asking someone to repeat themselves on a real call).

Score against this rubric — each category is 1-5, evaluated independently of the others (do not let a weakness in one category pull down the score of another):

- grammar (1-5): Uses correct tenses, sentence structure, and grammar with minimal mistakes. Score purely on grammatical accuracy and range, not on vocabulary, fluency, or pronunciation. In "examples" (0-3 items), quote short real fragments from the transcripts that are genuine grammar mistakes (not transcription artifacts) with a natural corrected version. If there are no real grammar mistakes worth noting, return an empty examples array and say so in the comment.
- vocabulary (1-5): Uses appropriate general and job-related (technical) vocabulary. Can express ideas without excessive word searching or over-reliance on basic/vague words. Weigh the technical answer (question 1) and the follow-up heavily here, since they reveal job-related vocabulary specifically; also note in the comment if there is a noticeable gap between everyday vocabulary (question 2) and technical vocabulary (question 1 / follow-up).
- fluency (1-5): Speaks naturally with minimal hesitation and maintains the flow of the answer — sentence construction, connected speech, self-correction and hesitation patterns visible in the transcript, range of structures.
- listening_comprehension (1-5): Understands questions without frequent repetition or clarification. Weigh the unscripted follow-up heavily: if the candidate needed a replay before answering, that is a concrete sign of a comprehension gap and should generally cap this score at 3 or below unless the rest of the evidence strongly compensates; if they answered the follow-up correctly on the first listen, that is strong positive evidence.
- communication_skills (1-5): Gives complete answers, explains ideas clearly, asks clarifying questions when appropriate, and keeps the conversation going rather than giving minimal one-line answers.
- observations: 2-3 specific, concrete remarks citing actual phrases from the transcripts (strengths and weaknesses), distinct from the grammar examples.

If an answer is empty or extremely short, score the affected categories 1 and say so plainly. Write all comments in English, concise and specific. Do not invent a "pronunciation" score or mention pronunciation at all — that is assessed separately by a human from the video, not from this transcript.`;

export interface EvaluationInput {
  question1: string;
  question2: string;
  transcript1: string;
  transcript2: string;
  followupQuestion?: string;
  followupTranscript?: string;
  followupReplayed?: boolean;
}

/** Throws on refusal or malformed model output — callers decide how to report it. */
export async function runEvaluation(input: EvaluationInput): Promise<Evaluation> {
  const hasFollowup = Boolean(input.followupQuestion);

  const userPrompt = [
    "Evaluate this candidate's spoken English.",
    "",
    "=== QUESTION 1 (technical) ===",
    input.question1,
    "",
    "=== ANSWER 1 (speech-to-text transcript) ===",
    input.transcript1?.trim() || "(empty answer)",
    "",
    ...(hasFollowup
      ? [
          "=== UNSCRIPTED FOLLOW-UP QUESTION (spoken to the candidate immediately after answer 1, no preparation time) ===",
          input.followupQuestion,
          "",
          `=== Did the candidate need to replay the follow-up question before answering? ${
            input.followupReplayed ? "YES — they used a replay" : "NO — answered after hearing it once"
          } ===`,
          "",
          "=== FOLLOW-UP ANSWER (speech-to-text transcript) ===",
          input.followupTranscript?.trim() || "(empty answer)",
          "",
        ]
      : ["=== No follow-up question was asked in this session ===", ""]),
    "=== QUESTION 2 (everyday) ===",
    input.question2,
    "",
    "=== ANSWER 2 (speech-to-text transcript) ===",
    input.transcript2?.trim() || "(empty answer)",
  ].join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: EVALUATION_SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: EVALUATION_SCHEMA },
    },
    messages: [{ role: "user", content: userPrompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Evaluation was declined by the model");
  }

  const textBlock = response.content.find((block) => block.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!textBlock) {
    throw new Error("Model returned no text output");
  }
  return JSON.parse(textBlock.text) as Evaluation;
}
