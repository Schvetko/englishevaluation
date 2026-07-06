export interface ScoredCriterion {
  score: 1 | 2 | 3 | 4 | 5;
  comment: string;
}

export interface Evaluation {
  comprehension: ScoredCriterion;
  fluency: ScoredCriterion;
  technical_vocabulary: ScoredCriterion;
  everyday_technical_gap: {
    gap: "none" | "moderate" | "significant";
    comment: string;
  };
  overall_band: "independent" | "supported" | "needs_support";
  observations: string[];
  reformulation_example: {
    original: string;
    improved: string;
  };
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
  answerMode1: "voice" | "text";
  answerMode2: "voice" | "text";
  videoUrls: string[];
  evaluation: Evaluation;
}
