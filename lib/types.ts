export type Score1to5 = 1 | 2 | 3 | 4 | 5;

export interface ScoredCriterion {
  score: Score1to5;
  comment: string;
}

export interface GrammarExample {
  original: string;
  correction: string;
}

export interface GrammarAssessment extends ScoredCriterion {
  examples: GrammarExample[];
}

/**
 * Automatically scored by the model from the transcripts (max 25 points).
 * Pronunciation is scored separately by the hiring team after watching the
 * candidate's video — the Anthropic API has no audio input, so it cannot be
 * judged from a text transcript.
 */
export interface Evaluation {
  grammar: GrammarAssessment;
  vocabulary: ScoredCriterion;
  fluency: ScoredCriterion;
  listening_comprehension: ScoredCriterion;
  communication_skills: ScoredCriterion;
  observations: string[];
}

export interface AssessmentRecord {
  id: string;
  createdAt: string;
  candidateName: string;
  question1: string;
  question2: string;
  transcript1: string;
  transcript2: string;
  duration1Seconds: number;
  duration2Seconds: number;
  followupQuestion: string;
  followupTranscript: string;
  followupDurationSeconds: number;
  followupReplayed: boolean;
  videoUrls: string[];
  evaluation: Evaluation;
  /** 1-5, filled in by the hiring team in /admin after watching the video. */
  pronunciationScore: Score1to5 | null;
}
