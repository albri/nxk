#!/usr/bin/env bash
# A product with one saved discovery scan: three offers, the answers the scan saved (synthetic), and the corners and
# gaps that the scan's own code (ownCorners, whiteSpace in scripts/corners.ts) finds in those answers.
set -euo pipefail
git init -q
mkdir -p .nxk/scans/ideas-uk.spec
cat > nxk.json <<'JSON'
{
 "version": 2,
 "country": "uk",
 "product": {
  "name": "Paperwork",
  "description": "Help with household paperwork: bills, forms, renewals and letters",
  "stage": "idea",
  "date": "2026-11-08"
 },
 "audience": null,
 "customers": [],
 "facts": [],
 "money": [],
 "questions": [],
 "discovery": {
  "scans": [
   {
    "id": "scan1",
    "kind": "ideas",
    "label": "first",
    "date": "2026-11-08",
    "max_usd": 0.2,
    "ideas": [
     {
      "key": "app",
      "offer": "An app that files your paperwork and reminds you of renewals, £4.99 a month."
     },
     {
      "key": "clerk",
      "offer": "A named clerk who does your forms and letters by phone, £9.99 a month."
     },
     {
      "key": "pack",
      "offer": "A printed checklist and ready-to-sign letters, posted to you every three months, £3 a month."
     }
    ],
    "corners": [
     {
      "key": "app",
      "among": "economic_activity_status=student_not_in_employment",
      "label": "Not working: a full-time student",
      "share": 0.0309,
      "odds": 1.359,
      "strength": "faint",
      "keen": 0.2874,
      "room": 0.2296
     },
     {
      "key": "clerk",
      "among": "internet_use_frequency=never_used_the_internet",
      "label": "Has never used the internet",
      "share": 0.0665,
      "odds": 2.019,
      "strength": "strong",
      "keen": 0.276,
      "room": 0.1663
     },
     {
      "key": "pack",
      "among": "economic_activity_status=looking_after_home_or_family",
      "label": "Not working: looking after home or family",
      "share": 0.0476,
      "odds": 1.077,
      "strength": "none",
      "keen": 0.1592,
      "room": 0.146
     }
    ],
    "nothing_for": [
     {
      "among": "home_tenure=rented_from_a_council_or_local_authority",
      "label": "Rented from a council or local authority",
      "share": 0.075,
      "best": "pack"
     }
    ]
   }
  ],
  "segments": []
 },
 "suggestions": [],
 "outcomes": []
}
JSON
cat > .nxk/scans/offers-uk.json <<'JSON'
{
 "app": "An app that files your paperwork and reminds you of renewals, £4.99 a month.",
 "clerk": "A named clerk who does your forms and letters by phone, £9.99 a month.",
 "pack": "A printed checklist and ready-to-sign letters, posted to you every three months, £3 a month."
}
JSON
cat > .nxk/scans/ideas-uk.spec/scan-app.jsonl <<'JSONL'
{"id":"home_and_travel.home_tenure=owned_outright","r":0,"p":0.1,"usd":0.0007}
{"id":"home_and_travel.home_tenure=owned_with_a_mortgage_or_loan","r":0,"p":0.3,"usd":0.0007}
{"id":"home_and_travel.home_tenure=rented_from_a_council_or_local_authority","r":0,"p":0.05,"usd":0.0007}
{"id":"home_and_travel.home_tenure=rented_from_a_housing_association_or_other_social_landlord","r":0,"p":0.15,"usd":0.0007}
{"id":"home_and_travel.home_tenure=rented_from_a_private_landlord_or_letting_agency","r":0,"p":0.5,"usd":0.0007}
{"id":"work.economic_activity_status=in_employment","r":0,"p":0.3,"usd":0.0007}
{"id":"work.economic_activity_status=retired","r":0,"p":0.04,"usd":0.0007}
{"id":"work.economic_activity_status=student_not_in_employment","r":0,"p":0.7,"usd":0.0007}
{"id":"work.economic_activity_status=unemployed_and_looking_for_work","r":0,"p":0.22,"usd":0.0007}
{"id":"work.economic_activity_status=looking_after_home_or_family","r":0,"p":0.22,"usd":0.0007}
{"id":"work.economic_activity_status=long_term_sick_or_disabled","r":0,"p":0.1,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=daily_or_almost_daily","r":0,"p":0.3,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=at_least_weekly_not_daily","r":0,"p":0.12,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=less_than_weekly","r":0,"p":0.05,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=never_used_the_internet","r":0,"p":0.005,"usd":0.0007}
{"id":"health.has_long_term_condition=yes","r":0,"p":0.12,"usd":0.0007}
{"id":"health.has_long_term_condition=no","r":0,"p":0.32,"usd":0.0007}
JSONL
cat > .nxk/scans/ideas-uk.spec/scan-clerk.jsonl <<'JSONL'
{"id":"home_and_travel.home_tenure=owned_outright","r":0,"p":0.35,"usd":0.0007}
{"id":"home_and_travel.home_tenure=owned_with_a_mortgage_or_loan","r":0,"p":0.1,"usd":0.0007}
{"id":"home_and_travel.home_tenure=rented_from_a_council_or_local_authority","r":0,"p":0.05,"usd":0.0007}
{"id":"home_and_travel.home_tenure=rented_from_a_housing_association_or_other_social_landlord","r":0,"p":0.18,"usd":0.0007}
{"id":"home_and_travel.home_tenure=rented_from_a_private_landlord_or_letting_agency","r":0,"p":0.06,"usd":0.0007}
{"id":"work.economic_activity_status=in_employment","r":0,"p":0.08,"usd":0.0007}
{"id":"work.economic_activity_status=retired","r":0,"p":0.65,"usd":0.0007}
{"id":"work.economic_activity_status=student_not_in_employment","r":0,"p":0.03,"usd":0.0007}
{"id":"work.economic_activity_status=unemployed_and_looking_for_work","r":0,"p":0.1,"usd":0.0007}
{"id":"work.economic_activity_status=looking_after_home_or_family","r":0,"p":0.14,"usd":0.0007}
{"id":"work.economic_activity_status=long_term_sick_or_disabled","r":0,"p":0.2,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=daily_or_almost_daily","r":0,"p":0.08,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=at_least_weekly_not_daily","r":0,"p":0.3,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=less_than_weekly","r":0,"p":0.6,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=never_used_the_internet","r":0,"p":0.92,"usd":0.0007}
{"id":"health.has_long_term_condition=yes","r":0,"p":0.1,"usd":0.0007}
{"id":"health.has_long_term_condition=no","r":0,"p":0.22,"usd":0.0007}
JSONL
cat > .nxk/scans/ideas-uk.spec/scan-pack.jsonl <<'JSONL'
{"id":"home_and_travel.home_tenure=owned_outright","r":0,"p":0.15,"usd":0.0007}
{"id":"home_and_travel.home_tenure=owned_with_a_mortgage_or_loan","r":0,"p":0.15,"usd":0.0007}
{"id":"home_and_travel.home_tenure=rented_from_a_council_or_local_authority","r":0,"p":0.05,"usd":0.0007}
{"id":"home_and_travel.home_tenure=rented_from_a_housing_association_or_other_social_landlord","r":0,"p":0.3,"usd":0.0007}
{"id":"home_and_travel.home_tenure=rented_from_a_private_landlord_or_letting_agency","r":0,"p":0.12,"usd":0.0007}
{"id":"work.economic_activity_status=in_employment","r":0,"p":0.14,"usd":0.0007}
{"id":"work.economic_activity_status=retired","r":0,"p":0.1,"usd":0.0007}
{"id":"work.economic_activity_status=student_not_in_employment","r":0,"p":0.08,"usd":0.0007}
{"id":"work.economic_activity_status=unemployed_and_looking_for_work","r":0,"p":0.2,"usd":0.0007}
{"id":"work.economic_activity_status=looking_after_home_or_family","r":0,"p":0.3,"usd":0.0007}
{"id":"work.economic_activity_status=long_term_sick_or_disabled","r":0,"p":0.18,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=daily_or_almost_daily","r":0,"p":0.15,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=at_least_weekly_not_daily","r":0,"p":0.3,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=less_than_weekly","r":0,"p":0.26,"usd":0.0007}
{"id":"digital_and_media.internet_use_frequency=never_used_the_internet","r":0,"p":0.06,"usd":0.0007}
{"id":"health.has_long_term_condition=yes","r":0,"p":0.09,"usd":0.0007}
{"id":"health.has_long_term_condition=no","r":0,"p":0.22,"usd":0.0007}
JSONL
