// What the README figures and the launch video say. render.mjs draws the figures and video.mjs the video; change a
// number here and run them again.

// The worked example in "How it works". It's hypothetical: the library and the numbers are made up.
export const library = {
  title: 'Ask a crowd, then follow the difference',
  lead: 'A library can fund five more opening hours a week. The agent asks four quick questions: 400 answers in about ten seconds.',
  note: 'Hypothetical example. The library and the numbers are made up.',
  people: 100,
  // Weighted by each person's chance of visiting.
  overall: { morning: 61, evening: 39 },
  // Share wanting each, by work. Full-time evening is the difference the agent follows.
  byWork: [
    { group: 'Retired', morning: 74, evening: 26 },
    { group: 'Part-time', morning: 50, evening: 50 },
    { group: 'Full-time', morning: 34, evening: 66 },
  ],
  file: 'opening-hours.yaml',
  before: ['extra_hours: 5', 'when: TBD'],
  question: '# who needs them?',
  after: ['tue 09:00-10:00', 'wed 09:00-10:00', 'thu 09:00-10:00', 'thu 18:00-20:00'],
  steps: [
    { title: 'Your agent hits a decision', text: 'Five more hours a week. Mornings or evenings?' },
    { title: 'It asks 100 likely visitors', text: 'Weighted by who’s likely to visit, mornings lead 61% to 39%.' },
    { title: 'It finds who answers differently', text: 'People in full-time work want evenings: 66%, 27 points above all likely visitors.' },
    { title: 'It changes the work', text: 'A follow-up shows Thursday is their evening. Three morning hours, and two on Thursday.' },
  ],
};

// Three people from the benchmark crowd, answering the same question (methodology.md, section 1).
export const answers = {
  title: 'Same question, different lives, different answers',
  question: 'Thinking about food in the UK today, how concerned, if at all, do you feel about affordability of food?',
  source: 'Food Standards Agency, November 2023',
  options: ['Not concerned at all', 'Not very concerned', 'Somewhat concerned', 'Highly concerned'],
  people: [
    { name: 'Elena, 25', role: 'Fitness trainer, South West England', facts: ['Household £70–100k', 'Budget managed', 'Owns with a mortgage'], p: [6, 65, 29, 0] },
    { name: 'Jonathan, 61', role: 'Social worker, South East England', facts: ['Household £20–35k', 'Financially constrained', 'Rents privately'], p: [0, 1, 89, 10] },
    { name: 'Christine, 52', role: 'Long-term sick or disabled, London', facts: ['Household under £20k', 'High financial pressure', 'Social housing'], p: [0, 0, 0, 100] },
  ],
  keep: 'nxk keeps every probability, not only each person’s top answer, so a narrow 51% lean and a clear 95% one stay different.',
  note: 'From the benchmark run on PersonaGen 3.x. Simulated people, not real ones.',
};

// The benchmark (methodology.md). Fill in the 4.0 run when it's recorded: `node benchmarks/score.mjs` prints the totals.
// A run with `pending: true` draws as a dashed placeholder.
export const benchmark = {
  title: 'Does it point the right way?',
  lead: '26 questions from 15 published UK and US surveys, with 1,000 simulated people per question. Each question also went to the model alone, with no person attached.',
  note: 'Recorded with Jev. Read the results for direction, not decimals.',
  questions: 26,
  gapsCompared: 16,
  // The three checks, each with its key: two shades of hit and an outline for a miss.
  checks: {
    leading: { title: 'Is the leading answer the survey’s, or the one next to it?', key: ['Exact', 'One step off', 'Missed'] },
    gaps: { title: 'Do the biggest gaps between groups point the same way?', key: ['Clearly', 'Faintly', 'The other way'], none: 'No gaps to compare: with no person attached, everyone gets the same answer' },
    avgGap: { title: 'How far is each answer from the survey, on average?', key: 'Shorter is better', unit: 'points' },
  },
  toCome: 'Results to come',
  runs: [
    { label: 'Model alone', leading: { exact: 14, close: 7 }, gaps: null, avgGap: 14.0 },
    { label: 'nxk on PersonaGen 3.x', leading: { exact: 16, close: 6 }, gaps: { clearly: 9, faintly: 3 }, avgGap: 9.7 },
    { label: 'nxk on PersonaGen 4.0', pending: true, leading: null, gaps: null, avgGap: null },
  ],
};

export const banner = {
  title: ['Give your agent', 'a crowd.'],
  lead: 'A skill for coding agents. It asks simulated people, drawn from real statistics, and shows who answers differently.',
  install: 'npx skills add albri/nxk',
};
