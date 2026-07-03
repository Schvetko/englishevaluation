const TECHNICAL_SCENARIOS = [
  'Tell us about the last feature you built. Walk us through what it does, how you implemented it, and one technical decision you had to make along the way.',
  'Describe a difficult bug you investigated recently. Explain what the symptoms were, how you tracked down the root cause, and how you fixed it.',
  'Imagine production is down and you are on call. A key API is returning errors for 20% of requests. Explain, step by step, how you would investigate and communicate during this incident.',
  'Explain the architecture of a project you worked on: the main components, how they communicate, and why it was designed that way.',
  'Describe a technical trade-off you had to make (for example: speed vs. quality, SQL vs. NoSQL, monolith vs. microservices). What options did you consider and why did you choose the one you did?',
  'A junior developer on your team asks you to explain how the deployment process works on your project. Explain it to them clearly, from commit to production.',
  'Tell us about a time you had to refactor or rewrite a piece of legacy code. What was wrong with it, what did you change, and what was the result?',
  'Explain how you would review a pull request: what you look for, and how you would give feedback about a serious problem you found in a colleague\'s code.',
  'Describe how caching works in a system you have used or built. What was cached, where, and what problems can caching introduce?',
  'You need to convince your team to adopt a new tool or technology. Pick a real example from your experience and make the case for it: the problem, the solution, and the risks.'
];

const EVERYDAY_QUESTIONS = [
  'What do you usually do on your weekends? Tell us about how you like to spend your free time.',
  'What motivated you to become a software developer, and what keeps you interested in this field today?',
  'Tell us about a hobby or interest you have outside of work. How did you get into it?',
  'Describe your ideal working day, from morning to evening. What makes a day feel productive and enjoyable for you?',
  'Tell us about a place you have travelled to or would like to travel to. What makes it interesting to you?',
  'What was the last book you read, film you watched, or podcast you listened to that you enjoyed? Why did you like it?'
];

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getQuestionPair() {
  return {
    technical: randomFrom(TECHNICAL_SCENARIOS),
    everyday: randomFrom(EVERYDAY_QUESTIONS)
  };
}

module.exports = { getQuestionPair, TECHNICAL_SCENARIOS, EVERYDAY_QUESTIONS };
