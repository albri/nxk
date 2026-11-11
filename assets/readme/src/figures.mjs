// What the README figures and the launch video say. render.mjs draws the figures and video.mjs the video; change a
// number here and run them again. The words and numbers match the nxk page on alexbristow.com, except that the README
// names the PersonaGen version each benchmark run used and keeps a row for the run still to come.

// The worked example in "How it works". It's hypothetical: the library and the numbers are made up.
export const library = {
  title: 'Ask a crowd, then follow the difference',
  lead: 'A library can fund five more opening hours a week, and the agent has to decide when.',
  note: 'Hypothetical example. The library and the numbers are made up.',
  // The hundred likely visitors, by kind of work, in the order the drawings show them. Retired people are far more
  // likely to visit (68% in the next three months, against 14% in full-time work). The ages and households, in the
  // order of `ages` and `households`, are only for the banner's drawing.
  ages: ['18–34', '35–54', '55–64', '65+'],
  households: ['Lives alone', 'Couple', 'Children at home'],
  mix: [
    { group: 'Retired', n: 62, age: [0, 0, 12, 50], household: [26, 33, 3] },
    { group: 'Part-time', n: 14, age: [5, 5, 4, 0], household: [3, 4, 7] },
    { group: 'Full-time', n: 24, age: [9, 11, 4, 0], household: [7, 7, 10] },
  ],
  // Weighted by each person's chance of visiting. With the mix above, 61 answer mornings.
  overall: { morning: 61, evening: 39 },
  // Share wanting each, by work.
  byWork: [
    { group: 'Retired', morning: 74, evening: 26 },
    { group: 'Part-time', morning: 50, evening: 50 },
    { group: 'Full-time', morning: 34, evening: 66 },
  ],
  file: 'opening-hours.yaml',
  before: ['extra_hours: 5', 'when: TBD'],
  question: '# who needs them?',
  // A comment names the group each run of hours is for.
  after: ['# retired', 'tue 09:00-10:00', 'wed 09:00-10:00', 'thu 09:00-10:00', '# full-time', 'thu 18:00-20:00'],
  steps: [
    { title: 'Your agent hits a decision', text: 'Five more hours a week. When would they help most?' },
    { title: 'It asks who will visit', text: 'Retired people are nearly five times as likely to come as full-time workers. They’re 62 of the 100 likely visitors.' },
    { title: 'It finds who answers differently', text: 'Weighted by who visits, mornings win 61% to 39%. Full-time workers lean the other way: 66% want evenings.' },
    { title: 'It changes the work', text: 'Three weekday mornings for the retired visitors, and Thursday evening, the one full-time workers pick.' },
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

// The longer run in examples/budgeting-app.md: a made-up budgeting app and a deliberately generic landing page, with
// the agent following the answers. The numbers are the recorded run's (examples/data/budgeting-app-run.json); the
// pilot's 80% and the 40% among people living paycheck to paycheck are from the write-up. A bar is
// [label, share, acted on]; `left` is a lead the agent saw and didn't follow.
export const tally = {
  title: 'Each answer picked the next question',
  lead: 'A made-up budgeting app, Tally, with a deliberately generic landing page. The agent followed the answers for about 35 minutes and 20p.',
  note: 'Tally isn’t real and the people are simulated. Every number is from one recorded run.',
  hops: [
    { title: 'Its first question was useless', text: '“Scroll down to find out more” cost nothing, so about 80% of a five-person pilot picked it.', then: 'Asked for a real choice instead' },
    { title: 'Most people don’t need it', text: 'Would try a new money app in the next three months:', bars: [['All UK adults', 14], ['Living paycheck to paycheck', 40, true]], then: 'Drew 160 people under high financial pressure' },
    {
      title: 'The price would put them off', text: '78% named £4.99 a month, with money already tight, as what would stop them.',
      left: 'Connecting a bank worried 11%, and 22% of the most privacy-cautious. A small group, and the page already says read-only.', then: 'Asked what it should do for them first',
    },
    {
      title: 'They want to know what’s safe to spend', text: 'The one feature to start with:',
      bars: [['Safe to spend until payday', 42, true], ['Warns before you go overdrawn', 33, true], ['Finds forgotten subscriptions', 17], ['Spending charts', 4], ['AI tips, as the page sold', 2]],
      then: 'Rebuilt Tally around the top two',
    },
    { title: 'A guarantee beat a discount', text: '£4.99, refunded any month it doesn’t save you £4.99, drew 29% against 12% for £1.99 a month.', then: 'Put the guarantee on a £2.99 upgrade, and those who’d pay went from 53% to 62%' },
    {
      title: 'The best headline sold a paid feature', text: 'Overdraft warnings were in the upgrade, so the page led with something you couldn’t have free.',
      left: 'Under-35s leaned towards “Get to payday without the overdraft”, 34% against 25%. One page needs one headline.', then: 'Made the warnings free. Starting and paying barely moved, 53% to 52%',
    },
  ],
  pages: [
    { when: 'Before', headline: 'Take control of your finances with AI-powered insights.', offer: '£4.99 a month after a free trial', picked: 0.3 },
    { when: 'After', headline: 'A heads-up before a bill takes you overdrawn.', offer: 'Free, with a £2.99 upgrade refunded any month it doesn’t save you £2.99', picked: 38 },
  ],
  held: 'Run again on 160 different people, every finding held.',
};

// The benchmark (methodology.md): the two checks of where the answers point. Fill in the 4.0 run when it's recorded
// (`node benchmarks/score.mjs` prints the totals); a run with `pending: true` draws as a dashed placeholder.
export const benchmark = {
  title: 'Does it point the right way?',
  lead: '26 questions from 15 published UK and US surveys, with 1,000 simulated people per question. Each question also went to the model alone, with no person attached.',
  note: 'Recorded with Jev. Read the results for direction, not decimals.',
  gapsCompared: 16,
  checks: {
    gaps: { title: 'Do the biggest gaps between groups point the same way?', key: ['Clearly', 'Faintly', 'The other way'], none: 'No gaps to compare: with no person attached, everyone gets the same answer' },
    avgGap: { title: 'How far is each answer from the survey, on average?', key: 'Points off the survey. Closer to 0 is better', both: 'Both runs', max: 16, ticks: [0, 4, 8, 12, 16] },
  },
  toCome: 'Results to come',
  runs: [
    { label: 'Model alone', gaps: null, avgGap: 14.0 },
    { label: 'nxk on PersonaGen 3.x', nxk: true, gaps: { clearly: 9, faintly: 3 }, avgGap: 9.7 },
    { label: 'nxk on PersonaGen 4.0', nxk: true, pending: true, gaps: null, avgGap: null },
  ],
};

export const banner = {
  title: ['Give your agent', 'a crowd.'],
  lead: 'A skill for coding agents. It asks simulated people, drawn from real statistics, and shows who answers differently.',
  install: 'npx skills add albri/nxk',
};
