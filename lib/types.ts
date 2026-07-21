export interface ScoredCriterion {
  score: 1 | 2 | 3 | 4 | 5;
  comment: string;
}

export interface GrammarExample {
  original: string;
  correction: string;
}

export interface GrammarAssessment extends ScoredCriterion {
  examples: GrammarExample[];
}

export interface Evaluation {
  comprehension: ScoredCriterion;
  fluency: ScoredCriterion;
  grammar: GrammarAssessment;
  technical_vocabulary: ScoredCriterion;
  spontaneous_followup: ScoredCriterion | null;
  everyday_technical_gap: {
    gap: "none" | "moderate" | "significant";
    comment: string;
  };
  overall_band: "independent" | "supported" | "needs_support";
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
  videoUrls: string[];
  evaluation: Evaluation;
}
