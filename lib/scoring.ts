import type { Evaluation } from "./types";

export interface ScoreBand {
  min: number;
  max: number;
  label: string;
  description: string;
}

// Mirrors the hiring team's "Overall Score" reference table (6 categories x
// 5 points = 30 max).
export const SCORE_BANDS: ScoreBand[] = [
  {
    min: 26,
    max: 30,
    label: "Strong B2+ / C1",
    description:
      "Ready for international communication, client meetings, presentations, and independent work in English.",
  },
  {
    min: 21,
    max: 25,
    label: "B2",
    description:
      "Comfortable in meetings and day-to-day communication. May need occasional support in complex discussions.",
  },
  {
    min: 16,
    max: 20,
    label: "B1",
    description:
      "Can communicate on familiar work topics but would benefit from additional English training.",
  },
  {
    min: 10,
    max: 15,
    label: "A2–B1",
    description:
      "Limited communication skills. Suitable for roles with minimal English requirements.",
  },
  {
    min: 0,
    max: 9,
    label: "Below A2",
    description: "English training recommended before using English in the workplace.",
  },
];

export function getScoreBand(total: number): ScoreBand {
  return (
    SCORE_BANDS.find((b) => total >= b.min && total <= b.max) ??
    SCORE_BANDS[SCORE_BANDS.length - 1]
  );
}

/**
 * True if a stored evaluation matches the current 6-category rubric.
 * Older assessments (scored before this rubric existed) are missing these
 * fields — checking this before reading `.score` off them avoids a crash on
 * "Cannot read properties of undefined".
 */
export function hasCurrentRubric(e: unknown): e is Evaluation {
  return (
    Boolean(e) &&
    typeof e === "object" &&
    "vocabulary" in (e as object) &&
    "listening_comprehension" in (e as object) &&
    "communication_skills" in (e as object)
  );
}

/** Sum of the 5 model-scored categories — max 25 of the 30-point scale. */
export function autoScoreTotal(e: Evaluation): number {
  return (
    (e.grammar?.score ?? 0) +
    (e.vocabulary?.score ?? 0) +
    (e.fluency?.score ?? 0) +
    (e.listening_comprehension?.score ?? 0) +
    (e.communication_skills?.score ?? 0)
  );
}

export const AUTO_SCORE_MAX = 25;
export const TOTAL_SCORE_MAX = 30;

export const CRITERIA_LABELS = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  fluency: "Fluency",
  listening_comprehension: "Listening / Comprehension",
  communication_skills: "Communication Skills",
  pronunciation: "Pronunciation",
} as const;

export const CRITERIA_DESCRIPTIONS = {
  grammar: "Uses correct tenses, sentence structure, and grammar with minimal mistakes.",
  vocabulary:
    "Uses appropriate general and job-related vocabulary. Can express ideas without excessive word searching.",
  fluency: "Speaks naturally with minimal hesitation and maintains the conversation.",
  listening_comprehension:
    "Understands questions without frequent repetition or clarification.",
  communication_skills:
    "Gives complete answers, explains ideas, asks clarifying questions, and keeps the conversation going.",
  pronunciation:
    "Speech is clear and easy to understand. Mispronunciations do not interfere with communication.",
} as const;
