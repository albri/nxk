#!/usr/bin/env bash
# A paperwork idea whose discovery scan of three offers finished in the background and has not been read: its record
# (.run.json, the process long gone), what it printed, and its saved answers (synthetic, from answers.ts beside this
# file: each offer draws its own people, and early adopters are keener on all three alike).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
git init -q
mkdir -p .nxk/scans
cat > nxk.json <<'JSON'
{
 "version": 2,
 "country": "uk",
 "product": {
  "name": "Paperwork",
  "description": "Help with household paperwork: bills, forms, renewals and letters",
  "stage": "idea",
  "date": "2026-11-12"
 },
 "audience": null,
 "customers": [],
 "facts": [],
 "money": [],
 "questions": [],
 "discovery": {
  "scans": [],
  "segments": []
 },
 "suggestions": [],
 "outcomes": []
}
JSON
cat > .nxk/scans/offers.run.json <<'JSON'
{"pid":4206649,"started":"2026-11-12T16:05:00.000Z","label":"offers","ideas":[{"key":"app","offer":"An app that files your paperwork and reminds you of renewals, £4.99 a month.","fields":["age_years","economic_activity_status","home_tenure"]},{"key":"clerk","offer":"A named clerk who does your forms and letters by phone, £9.99 a month.","fields":["age_years","economic_activity_status","home_tenure"]},{"key":"pack","offer":"A printed checklist and ready-to-sign letters, posted to you every three months, £3 a month.","fields":["age_years","economic_activity_status","home_tenure"]}]}
JSON
cat > .nxk/scans/offers.run.log <<'LOG'
36 requests (156 questions) across 3 versions to gemini-decision-1 through Google's Decisions API, about 0.3 cents; limit 20.0 cents.
Kept to the Tier 1 limits of 1,000,000 tokens and 1,500 requests a minute: about 1 minute.
Spent $0.003 on this spec.
LOG
# What the scan meant as it printed (scripts/log.ts): its pace, and what it spent once it finished sending.
cat > .nxk/scans/offers.run.jsonl <<'JSONL'
{"type":"run","tool":"scan","via":"script","args":[],"label":"simulated","run":"seed0001"}
{"type":"paced","minutes":1,"run":"seed0001"}
{"type":"spent","usd":0.003,"run":"seed0001"}
JSONL
cat > .nxk/scans/offers-uk.json <<'JSON'
{
 "app": "An app that files your paperwork and reminds you of renewals, £4.99 a month.",
 "clerk": "A named clerk who does your forms and letters by phone, £9.99 a month.",
 "pack": "A printed checklist and ready-to-sign letters, posted to you every three months, £3 a month."
}
JSON
node "$here/answers.ts" .nxk/scans/ideas-uk.spec
