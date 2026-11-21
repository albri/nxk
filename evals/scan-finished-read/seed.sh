#!/usr/bin/env bash
# A product whose first discovery scan ran in the background and has finished: its record (.run.json, the process
# long gone), what it printed, and its saved answers (synthetic: each offer leans towards its own people).
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
  "date": "2026-11-14"
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
cat > .nxk/scans/first.run.json <<'JSON'
{"pid":4206649,"started":"2026-11-14T16:05:00.000Z","label":"first","ideas":[{"key":"app","offer":"An app that files your paperwork and reminds you of renewals, £4.99 a month.","fields":["home_tenure"]},{"key":"clerk","offer":"A named clerk who does your forms and letters by phone, £9.99 a month.","fields":["home_tenure"]},{"key":"pack","offer":"A printed checklist and ready-to-sign letters, posted to you every three months, £3 a month.","fields":["home_tenure"]}]}
JSON
cat > .nxk/scans/first.run.log <<'LOG'
36 requests (168 questions) across 3 versions to gemini-decision-1 through Google's Decisions API, about 0.3 cents; limit 20.0 cents.
Kept to the Tier 1 limits of 1,000,000 tokens and 1,500 requests a minute: about 1 minute.
Spent $0.003 on this spec.
LOG
# What the scan meant as it printed (scripts/log.ts): its pace, and what it spent once it finished sending.
cat > .nxk/scans/first.run.jsonl <<'JSONL'
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
cat > .nxk/scans/ideas-uk.spec/scan-app.jsonl <<'JSONL'
{"id":"base","r":0,"p":0.2,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=owned_outright","r":0,"p":0.184,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=owned_with_a_mortgage_or_loan","r":0,"p":0.232,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=shared_ownership","r":0,"p":0.156,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_council_or_local_authority","r":0,"p":0.224,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_housing_association_or_other_social_landlord","r":0,"p":0.186,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_private_landlord_or_letting_agency","r":0,"p":0.5,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_relative_friend_or_employer_or_other_private_rented","r":0,"p":0.215,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=lives_rent_free","r":0,"p":0.219,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=communal_establishment","r":0,"p":0.179,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=low_household_resources","r":0,"p":0.183,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=modest_household_resources","r":0,"p":0.189,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=middle_household_resources","r":0,"p":0.201,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=high_household_resources","r":0,"p":0.167,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=very_high_household_resources","r":0,"p":0.223,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=daily_or_almost_daily","r":0,"p":0.5,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=at_least_weekly_not_daily","r":0,"p":0.5,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=less_than_weekly","r":0,"p":0.04,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=not_used_in_the_last_3_months","r":0,"p":0.04,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=never_used_the_internet","r":0,"p":0.04,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=low_digital_skills","r":0,"p":0.192,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=basic_digital_skills","r":0,"p":0.04,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=above_basic_digital_skills","r":0,"p":0.5,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=no_digital_skills_does_not_use_the_internet","r":0,"p":0.04,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=among_the_first_to_try_it","r":0,"p":0.5,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=soon_after_the_first_users","r":0,"p":0.17,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=when_most_people_have_it","r":0,"p":0.188,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=after_most_people_have_it","r":0,"p":0.199,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=last_or_never","r":0,"p":0.04,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=sticks_to_one_or_two_brands","r":0,"p":0.184,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=prefers_trusted_brands_but_will_switch","r":0,"p":0.174,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=buys_from_a_group_of_brands","r":0,"p":0.219,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=switches_to_whichever_is_on_offer","r":0,"p":0.203,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=prefers_premium_brands","r":0,"p":0.237,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.says_advertising_influences_what_they_buy=advertising_influences_what_they_buy_a_lot","r":0,"p":0.165,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.says_advertising_influences_what_they_buy=advertising_influences_what_they_buy_a_little","r":0,"p":0.215,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.says_advertising_influences_what_they_buy=advertising_does_not_influence_what_they_buy","r":0,"p":0.228,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=willing_to_take_substantial_financial_risk","r":0,"p":0.172,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=willing_to_take_above_average_financial_risk","r":0,"p":0.161,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=willing_to_take_average_financial_risk","r":0,"p":0.158,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=not_willing_to_take_any_financial_risk","r":0,"p":0.151,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=lowest_fifth","r":0,"p":0.223,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=second_fifth","r":0,"p":0.184,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=middle_fifth","r":0,"p":0.241,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=fourth_fifth","r":0,"p":0.153,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=highest_fifth","r":0,"p":0.153,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=lowest_fifth","r":0,"p":0.223,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=second_fifth","r":0,"p":0.184,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=middle_fifth","r":0,"p":0.241,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=fourth_fifth","r":0,"p":0.153,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=highest_fifth","r":0,"p":0.153,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=lowest_fifth","r":0,"p":0.223,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=second_fifth","r":0,"p":0.184,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=middle_fifth","r":0,"p":0.241,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=fourth_fifth","r":0,"p":0.153,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=highest_fifth","r":0,"p":0.153,"usd":0,"m":"gemini-decision-1"}
JSONL
cat > .nxk/scans/ideas-uk.spec/scan-clerk.jsonl <<'JSONL'
{"id":"base","r":0,"p":0.2,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=owned_outright","r":0,"p":0.6,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=owned_with_a_mortgage_or_loan","r":0,"p":0.23,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=shared_ownership","r":0,"p":0.247,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_council_or_local_authority","r":0,"p":0.242,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_housing_association_or_other_social_landlord","r":0,"p":0.211,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_private_landlord_or_letting_agency","r":0,"p":0.228,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_relative_friend_or_employer_or_other_private_rented","r":0,"p":0.176,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=lives_rent_free","r":0,"p":0.247,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=communal_establishment","r":0,"p":0.21,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=low_household_resources","r":0,"p":0.228,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=modest_household_resources","r":0,"p":0.215,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=middle_household_resources","r":0,"p":0.227,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=high_household_resources","r":0,"p":0.242,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=very_high_household_resources","r":0,"p":0.221,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=daily_or_almost_daily","r":0,"p":0.05,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=at_least_weekly_not_daily","r":0,"p":0.05,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=less_than_weekly","r":0,"p":0.6,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=not_used_in_the_last_3_months","r":0,"p":0.6,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=never_used_the_internet","r":0,"p":0.6,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=low_digital_skills","r":0,"p":0.212,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=basic_digital_skills","r":0,"p":0.205,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=above_basic_digital_skills","r":0,"p":0.156,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=no_digital_skills_does_not_use_the_internet","r":0,"p":0.231,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=among_the_first_to_try_it","r":0,"p":0.05,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=soon_after_the_first_users","r":0,"p":0.196,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=when_most_people_have_it","r":0,"p":0.162,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=after_most_people_have_it","r":0,"p":0.2,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=last_or_never","r":0,"p":0.6,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=sticks_to_one_or_two_brands","r":0,"p":0.184,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=prefers_trusted_brands_but_will_switch","r":0,"p":0.223,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=buys_from_a_group_of_brands","r":0,"p":0.219,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=switches_to_whichever_is_on_offer","r":0,"p":0.153,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=prefers_premium_brands","r":0,"p":0.167,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.says_advertising_influences_what_they_buy=advertising_influences_what_they_buy_a_lot","r":0,"p":0.238,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.says_advertising_influences_what_they_buy=advertising_influences_what_they_buy_a_little","r":0,"p":0.213,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.says_advertising_influences_what_they_buy=advertising_does_not_influence_what_they_buy","r":0,"p":0.16,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=willing_to_take_substantial_financial_risk","r":0,"p":0.244,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=willing_to_take_above_average_financial_risk","r":0,"p":0.194,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=willing_to_take_average_financial_risk","r":0,"p":0.207,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=not_willing_to_take_any_financial_risk","r":0,"p":0.2,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=lowest_fifth","r":0,"p":0.229,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=second_fifth","r":0,"p":0.189,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=middle_fifth","r":0,"p":0.246,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=fourth_fifth","r":0,"p":0.158,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=highest_fifth","r":0,"p":0.215,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=lowest_fifth","r":0,"p":0.229,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=second_fifth","r":0,"p":0.189,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=middle_fifth","r":0,"p":0.246,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=fourth_fifth","r":0,"p":0.158,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=highest_fifth","r":0,"p":0.215,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=lowest_fifth","r":0,"p":0.229,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=second_fifth","r":0,"p":0.189,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=middle_fifth","r":0,"p":0.246,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=fourth_fifth","r":0,"p":0.158,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=highest_fifth","r":0,"p":0.215,"usd":0,"m":"gemini-decision-1"}
JSONL
cat > .nxk/scans/ideas-uk.spec/scan-pack.jsonl <<'JSONL'
{"id":"base","r":0,"p":0.2,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=owned_outright","r":0,"p":0.1,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=owned_with_a_mortgage_or_loan","r":0,"p":0.1,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=shared_ownership","r":0,"p":0.213,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_council_or_local_authority","r":0,"p":0.45,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_housing_association_or_other_social_landlord","r":0,"p":0.45,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_private_landlord_or_letting_agency","r":0,"p":0.23,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=rented_from_a_relative_friend_or_employer_or_other_private_rented","r":0,"p":0.235,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=lives_rent_free","r":0,"p":0.185,"usd":0,"m":"gemini-decision-1"}
{"id":"home_and_travel.home_tenure=communal_establishment","r":0,"p":0.167,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=low_household_resources","r":0,"p":0.204,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=modest_household_resources","r":0,"p":0.17,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=middle_household_resources","r":0,"p":0.182,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=high_household_resources","r":0,"p":0.202,"usd":0,"m":"gemini-decision-1"}
{"id":"money.household_resource_context=very_high_household_resources","r":0,"p":0.226,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=daily_or_almost_daily","r":0,"p":0.171,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=at_least_weekly_not_daily","r":0,"p":0.45,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=less_than_weekly","r":0,"p":0.245,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=not_used_in_the_last_3_months","r":0,"p":0.21,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.internet_use_frequency=never_used_the_internet","r":0,"p":0.238,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=low_digital_skills","r":0,"p":0.198,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=basic_digital_skills","r":0,"p":0.184,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=above_basic_digital_skills","r":0,"p":0.211,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.digital_skill_level=no_digital_skills_does_not_use_the_internet","r":0,"p":0.17,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=among_the_first_to_try_it","r":0,"p":0.155,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=soon_after_the_first_users","r":0,"p":0.151,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=when_most_people_have_it","r":0,"p":0.223,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=after_most_people_have_it","r":0,"p":0.166,"usd":0,"m":"gemini-decision-1"}
{"id":"digital_and_media.new_technology_adoption=last_or_never","r":0,"p":0.19,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=sticks_to_one_or_two_brands","r":0,"p":0.178,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=prefers_trusted_brands_but_will_switch","r":0,"p":0.192,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=buys_from_a_group_of_brands","r":0,"p":0.213,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=switches_to_whichever_is_on_offer","r":0,"p":0.161,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.brand_choice_when_shopping=prefers_premium_brands","r":0,"p":0.224,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.says_advertising_influences_what_they_buy=advertising_influences_what_they_buy_a_lot","r":0,"p":0.197,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.says_advertising_influences_what_they_buy=advertising_influences_what_they_buy_a_little","r":0,"p":0.22,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.says_advertising_influences_what_they_buy=advertising_does_not_influence_what_they_buy","r":0,"p":0.167,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=willing_to_take_substantial_financial_risk","r":0,"p":0.204,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=willing_to_take_above_average_financial_risk","r":0,"p":0.2,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=willing_to_take_average_financial_risk","r":0,"p":0.176,"usd":0,"m":"gemini-decision-1"}
{"id":"shopping_and_decisions.financial_risk_tolerance=not_willing_to_take_any_financial_risk","r":0,"p":0.169,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=lowest_fifth","r":0,"p":0.162,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=second_fifth","r":0,"p":0.223,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=middle_fifth","r":0,"p":0.18,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=fourth_fifth","r":0,"p":0.192,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_openness_quintile=highest_fifth","r":0,"p":0.248,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=lowest_fifth","r":0,"p":0.162,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=second_fifth","r":0,"p":0.223,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=middle_fifth","r":0,"p":0.18,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=fourth_fifth","r":0,"p":0.192,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_conscientiousness_quintile=highest_fifth","r":0,"p":0.248,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=lowest_fifth","r":0,"p":0.162,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=second_fifth","r":0,"p":0.223,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=middle_fifth","r":0,"p":0.18,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=fourth_fifth","r":0,"p":0.192,"usd":0,"m":"gemini-decision-1"}
{"id":"personality_and_skills.big_five_extraversion_quintile=highest_fifth","r":0,"p":0.248,"usd":0,"m":"gemini-decision-1"}
JSONL
