export interface TechScenario {
  id: string;
  title: string;
  prompt: string;
}

export const TECH_SCENARIOS: TechScenario[] = [
  {
    id: "bug-postmortem",
    title: "Explaining a bug",
    prompt:
      "Tell us about a difficult bug you found and fixed. Explain what the symptoms were, how you investigated it, what the root cause turned out to be, and how you fixed it. Imagine you are explaining it to a teammate who hasn't seen the code.",
  },
  {
    id: "incident",
    title: "Production incident",
    prompt:
      "Describe a production incident you were involved in (an outage, a performance degradation, data loss — anything). Walk us through the timeline: how it was detected, what you did to mitigate it, and what changed afterwards to prevent it from happening again.",
  },
  {
    id: "architecture",
    title: "System architecture",
    prompt:
      "Describe the architecture of a system you have worked on. Explain the main components, how they communicate, where the data lives, and one design decision you would make differently today.",
  },
  {
    id: "tradeoff",
    title: "Technical trade-off",
    prompt:
      "Tell us about a technical trade-off you had to make (for example: speed of delivery vs code quality, SQL vs NoSQL, monolith vs microservices, buy vs build). Explain the options you considered, what you chose, and why.",
  },
  {
    id: "last-feature",
    title: "Recent feature",
    prompt:
      "Describe the last significant feature you built. Explain what problem it solved for users, how you implemented it technically, what was hard about it, and how you tested it.",
  },
  {
    id: "code-review",
    title: "Code review disagreement",
    prompt:
      "Imagine a colleague opened a pull request with an approach you disagree with. Explain, as if speaking to them, what your concern is and what you would suggest instead. Pick any real or realistic technical example.",
  },
  {
    id: "explain-to-pm",
    title: "Explaining tech debt",
    prompt:
      "Your product manager asks why the team needs two weeks to refactor instead of shipping new features. Explain, as if speaking to them, what technical debt is in your current project, and why paying it down now saves time later.",
  },
  {
    id: "performance",
    title: "Performance problem",
    prompt:
      "Tell us about a time you had to make something faster — a slow endpoint, a slow query, a slow build, a laggy UI. How did you measure the problem, what did you try, and what finally worked?",
  },
];

export const EVERYDAY_QUESTIONS: string[] = [
  "What do you usually do on your weekends? Tell us about a recent weekend you really enjoyed.",
  "What made you choose a career in IT? Tell us the story of how you got into this field.",
  "Tell us about a hobby or interest you have outside of work. Why do you enjoy it?",
  "Describe a place you have travelled to (or would love to travel to) and what makes it special for you.",
  "What does your typical working day look like, from morning to evening?",
  "Tell us about a book, film, or series you enjoyed recently and why you would recommend it.",
];

export const ANSWER_LIMIT_SECONDS = 7 * 60;
export const SOFT_WARNING_SECONDS = 5 * 60;

// The follow-up question is answered with no preparation time, so it gets
// a much shorter window than the two main answers.
export const FOLLOWUP_LIMIT_SECONDS = 2 * 60;
