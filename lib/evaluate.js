const Anthropic = require('@anthropic-ai/sdk');

const EVALUATION_SCHEMA = {
  type: 'object',
  properties: {
    comprehension: {
      type: 'object',
      properties: {
        score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        comment: { type: 'string' }
      },
      required: ['score', 'comment'],
      additionalProperties: false
    },
    fluency: {
      type: 'object',
      properties: {
        score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        comment: { type: 'string' }
      },
      required: ['score', 'comment'],
      additionalProperties: false
    },
    technical_vocabulary: {
      type: 'object',
      properties: {
        score: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        comment: { type: 'string' }
      },
      required: ['score', 'comment'],
      additionalProperties: false
    },
    everyday_technical_gap: {
      type: 'object',
      properties: {
        gap: { type: 'string', enum: ['none', 'small', 'significant'] },
        comment: { type: 'string' }
      },
      required: ['gap', 'comment'],
      additionalProperties: false
    },
    overall_band: {
      type: 'string',
      enum: ['independent', 'supported', 'needs_support']
    },
    observations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          issue: { type: 'string' },
          quote: { type: 'string' },
          reformulation: { type: 'string' }
        },
        required: ['issue', 'quote', 'reformulation'],
        additionalProperties: false
      }
    },
    summary: { type: 'string' }
  },
  required: [
    'comprehension',
    'fluency',
    'technical_vocabulary',
    'everyday_technical_gap',
    'overall_band',
    'observations',
    'summary'
  ],
  additionalProperties: false
};

const SYSTEM_PROMPT = `You are an English language assessor for an IT company's hiring process.
You evaluate spoken English transcripts from candidates for software engineering roles.

The candidate answered two questions out loud (transcribed by speech recognition, so ignore
missing punctuation and obvious transcription artifacts — judge the language, not the transcriber):
- Question 1 is a TECHNICAL scenario (explaining a bug, incident, architecture, trade-off, or a recent feature).
- Question 2 is an EVERYDAY / general question (motivation, hobbies, weekends).

Evaluate against this rubric, scoring 1-5 (1 = very weak, 5 = strong):
- comprehension: did the candidate understand the question and answer it relevantly?
- fluency (production): sentence flow, hesitation markers, self-correction, ability to keep going.
- technical_vocabulary: ONLY based on question 1 — precision and range of technical terms.
- everyday_technical_gap: compare the two answers — does fluency drop specifically on technical
  content, or is the level consistent? ("none" = consistent, "small" = mild drop, "significant" = clear drop)

overall_band:
- "independent" — can work in an English-speaking team with no support (meetings, incidents, docs).
- "supported" — can handle routine communication but needs occasional support in complex discussions.
- "needs_support" — communication requires substantial support; not ready for English-only environment.

observations: exactly 2 or 3 concrete, actionable observations. Each must include a short quote
(or close paraphrase) from the candidate's transcript and an improved reformulation in natural English.

summary: 2-3 sentences for the hiring manager, in plain English.

Base every judgment strictly on the transcripts provided. If a transcript is very short or empty,
score accordingly and say so.`;

async function evaluateAnswers({ question1, transcript1, question2, transcript2 }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userMessage = `QUESTION 1 (technical):
${question1}

CANDIDATE ANSWER 1 (transcript):
${transcript1 || '(empty)'}

QUESTION 2 (everyday):
${question2}

CANDIDATE ANSWER 2 (transcript):
${transcript2 || '(empty)'}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: 'json_schema', schema: EVALUATION_SCHEMA }
    },
    messages: [{ role: 'user', content: userMessage }]
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Evaluation was refused by the model');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text content in model response');
  }
  return JSON.parse(textBlock.text);
}

module.exports = { evaluateAnswers };
