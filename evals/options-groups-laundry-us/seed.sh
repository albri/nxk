#!/usr/bin/env bash
# A laundry service with one saved options scan: three versions (today's price, a cheaper one, a weekly plan) and
# their saved answers (synthetic, from answers.ts beside this file: the best version changes from group to group).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
git init -q
mkdir -p .nxk/scans/options
cat > nxk.json <<'JSON'
{
 "version": 2,
 "country": "us",
 "product": {
  "name": "Laundry pickup and delivery (Columbus, OH)",
  "description": "We collect a bag of laundry, wash and fold it, and bring it back within 48 hours. $1.75 a pound, $30 minimum.",
  "stage": "defined",
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
cat > .nxk/scans/options/laundry-versions.json <<'JSON'
{
 "surveyed": "November 2026",
 "versions": {
  "base": "A laundry pickup and delivery service has operated where you live for the past year. They collect a bag from your door, wash and fold it, and bring it back within 48 hours. It costs $1.75 a pound with a $30 minimum per order.",
  "cheaper": "A laundry pickup and delivery service has operated where you live for the past year. They collect a bag from your door, wash and fold it, and bring it back within 48 hours. It costs $1.25 a pound with a $20 minimum per order.",
  "weekly": "A laundry pickup and delivery service has operated where you live for the past year. They collect a bag from your door every week on a set day, wash and fold it, and bring it back within 48 hours. It costs $1.75 a pound with a $30 minimum, and you can skip any week."
 },
 "questions": {
  "act": {
   "type": "choice",
   "text": "What would you do next?",
   "options": ["Try it in the next month", "Keep doing my laundry myself or at a laundromat", "Think about it but probably not try it", "Not interested"]
  }
 },
 "watch": ["act", "Try it in the next month"]
}
JSON
node "$here/answers.ts" .nxk/scans/options/laundry-versions
