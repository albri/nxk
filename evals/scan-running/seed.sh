#!/usr/bin/env bash
# A product whose first scan is running in the background (a stand-in process, started six minutes before).
set -euo pipefail
git init -q
cat > nxk.json <<'EOF_SEED'
{
 "version": 2,
 "country": "uk",
 "product": {
  "name": "Paperwork",
  "description": "Help with household paperwork: bills, forms, renewals and letters",
  "stage": "idea",
  "date": "2026-11-10"
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
EOF_SEED
mkdir -p .nxk/scans
cat > .nxk/scans/first.run.log <<'EOF_SEED'
1,359 requests (9,180 questions) across 3 versions to gemini-decision-1 through Google's Decisions API, no charge on Google's Free Tier; limit 20.0 cents.
Kept to the Free Tier limits of 50,000 tokens and 200 requests a minute: about 33 minutes.
EOF_SEED
# What the scan meant as it printed (scripts/log.ts): its pace.
cat > .nxk/scans/first.run.jsonl <<'EOF_SEED'
{"type":"run","tool":"scan","via":"script","args":[],"label":"simulated","run":"seed0001"}
{"type":"paced","minutes":33,"run":"seed0001"}
EOF_SEED
nohup sleep 1500 >/dev/null 2>&1 &
pid=$!
started=$(date -u -v-6M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '6 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
cat > .nxk/scans/first.run.json <<EOF_RUN
{"pid":$pid,"started":"$started","label":"first","ideas":[{"key":"app","offer":"An app that files your paperwork and reminds you of renewals, £4.99 a month."},{"key":"clerk","offer":"A named clerk who does your forms and letters by phone, £9.99 a month."},{"key":"pack","offer":"A printed checklist and ready-to-sign letters, posted to you every three months, £3 a month."}]}
EOF_RUN
