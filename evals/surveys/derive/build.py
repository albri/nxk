"""Assembles benchmarks/v4/studies.json from the derive outputs (benchmarks/v4/derive/aggregates/*.json) and checks it.

usage: python3 -I -B benchmarks/v4/derive/build.py [--schema PATH_TO_schema-4.0.json]

The numbers come only from the derive outputs; this file holds what a survey's files do not: the question as nxk asks it, the option labels, who
was asked (as PersonaGen 4.0 filters), the profile fields that should drive the answer, and the labels of the groups. The split into dev and test
is a seeded shuffle of each country's studies. The checks: every group and universe rule names a 4.0 field and values that exist for the study's
country; every distribution sums to 100 within rounding; every kept group has at least 100 respondents; every study has at most 6 options.
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
V4 = os.path.dirname(HERE)
SEED = 20261111
MIN_N = 100
DEFAULT_SCHEMA = "schema-4.0.json"  # PersonaGen 4.0 schema; pass --schema

US_HOUSEHOLDS = {"field": "household_type", "in": ["one_person_household", "couple_household_without_children", "couple_household_with_dependent_children",
                                                   "couple_household_with_only_adult_children", "lone_parent_household_with_dependent_children",
                                                   "lone_parent_household_with_only_adult_children", "other_household_with_dependent_children",
                                                   "other_household_with_adults_only"]}
UK_HOUSEHOLDS = US_HOUSEHOLDS
US_CIVILIAN = {"field": "employer_sector", "in": ["private_for_profit_company", "private_non_profit_organization", "local_government", "state_government",
                                                  "federal_government_civilian", "self_employed_or_family_business", "not_in_employment"]}
NOT_RETIRED = {"field": "economic_activity_status", "in": ["in_employment", "unemployed_and_looking_for_work", "student_not_in_employment",
                                                           "looking_after_home_or_family", "long_term_sick_or_disabled", "other_not_working"]}

UK_GB = {"field": "region", "in": ["north_east_england", "north_west_england", "yorkshire_and_the_humber", "east_midlands", "west_midlands",
                                   "east_of_england", "london", "south_east_england", "south_west_england", "wales", "scotland"]}
UK_EWNI = {"field": "region", "in": ["north_east_england", "north_west_england", "yorkshire_and_the_humber", "east_midlands", "west_midlands",
                                     "east_of_england", "london", "south_east_england", "south_west_england", "wales", "northern_ireland"]}
UK_ENGLAND = {"field": "region", "in": ["north_east_england", "north_west_england", "yorkshire_and_the_humber", "east_midlands", "west_midlands",
                                        "east_of_england", "london", "south_east_england", "south_west_england"]}
PAYS_HOUSING = {"field": "home_tenure", "in": ["owned_with_a_mortgage_or_loan", "shared_ownership", "rented_from_a_council_or_local_authority",
                                               "rented_from_a_housing_association_or_other_social_landlord", "rented_from_a_private_landlord_or_letting_agency",
                                               "rented_from_a_relative_friend_or_employer_or_other_private_rented"]}
HOUSEHOLDER = {"field": "position_in_household", "in": ["householder_or_partner_of_householder"]}

# Bucket order follows these dicts; each source uses the keys it has. UK sources keep their own age bands, and the youngest (16 to 24, 16 to 29)
# is matched to personas from 18.
DIMENSIONS = {
    "age": ("Age", {"16_24": "16 to 24 (survey band; personas 18 to 24)", "16_29": "16 to 29 (survey band; personas 18 to 29)", "18_29": "18 to 29",
                    "25_34": "25 to 34", "30_44": "30 to 44", "30_49": "30 to 49", "35_44": "35 to 44", "35_49": "35 to 49", "45_54": "45 to 54", "45_64": "45 to 64",
                    "50_69": "50 to 69", "50_64": "50 to 64", "55_64": "55 to 64", "65_74": "65 to 74", "65_plus": "65 and over", "70_plus": "70 and over",
                    "75_plus": "75 and over"}),
    "sex": ("Sex", {"female": "Women", "male": "Men"}),
    "income": ("Household income", {"under_25k": "Under $25,000", "25k_50k": "$25,000 to $49,999", "50k_100k": "$50,000 to $99,999",
                                     "100k_150k": "$100,000 to $149,999", "150k_plus": "$150,000 or more"}),
    "tenure": ("Home tenure", {"owned": "Owners", "rented": "Renters", "outright": "Own outright", "mortgage": "Own with a mortgage or loan",
                               "social_rent": "Rent from a council or housing association", "private_rent": "Rent from a private landlord"}),
    "education": ("Education", {"hs_or_less": "High school or less", "some_college": "Some college or associate degree",
                                "degree": "Bachelor's degree or higher", "none": "No qualifications"}),
    "work": ("Work status", {"in_employment": "In work", "retired": "Retired", "not_working": "Not working, not retired", "unemployed": "Unemployed",
                             "inactive_other": "Not working, not retired, not looking for work",
                             "not_in_work": "Not in work (retired included)"}),
    "children": ("Own dependent children at home", {"none": "None", "one_or_more": "One or more"}),
    "household_size": ("People in household", {"1": "1", "2": "2", "3": "3", "4": "4", "5_plus": "5 or more"}),
    "health_limitation": ("Disability", {"limited_a_lot": "A lot of difficulty with a basic activity, or cannot do it",
                                         "not_limited_a_lot": "No such difficulty",
                                         "disabled": "Disabled: a long-term condition that reduces day-to-day activities", "not_disabled": "Not disabled"}),
    "long_term_condition": ("Long-term health condition", {"yes": "Has a condition lasting 12 months or more", "no": "No long-term condition"}),
    "insurance": ("Health insurance", {"uninsured": "Uninsured", "private_only": "Private only", "medicaid_or_public_only": "Medicaid or other public only",
                                       "medicare": "Medicare, alone or with private or Medicaid"}),
}

SHED_SOURCE = {"name": "Survey of Household Economics and Decisionmaking 2024 (public use data)", "organisation": "Board of Governors of the Federal Reserve System",
               "url": "https://www.federalreserve.gov/consumerscommunities/shed_data.htm", "derive": "derive/shed.py", "aggregates": "derive/aggregates/shed.json"}
NHIS_SOURCE = {"name": "National Health Interview Survey 2024 (sample adult file)", "organisation": "National Center for Health Statistics (CDC)",
               "url": "https://www.cdc.gov/nchs/nhis/documentation/2024-nhis.html", "derive": "derive/nhis.py", "aggregates": "derive/aggregates/nhis.json"}
ONS_BASE = {"name": "Opinions and Lifestyle Survey: Public opinions and social trends, Great Britain", "organisation": "Office for National Statistics",
            "derive": "derive/ons_opn.py", "aggregates": "derive/aggregates/ons_opn.json"}
ONS_HF = dict(ONS_BASE, name=ONS_BASE["name"] + ": household finances (personal characteristics), July to September 2026", url="https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/debt/datasets/publicopinionsandsocialtrendsgreatbritainhouseholdfinancesbypersonalcharacteristics")
ONS_WL = dict(ONS_BASE, name=ONS_BASE["name"] + ": personal well-being and loneliness (personal characteristics), July to September 2026", url="https://www.ons.gov.uk/peoplepopulationandcommunity/healthandsocialcare/healthandwellbeing/datasets/publicopinionsandsocialtrendsgreatbritainpersonalwellbeingandlonelinessbypersonalcharacteristics")
ONS_WP = dict(ONS_BASE, name=ONS_BASE["name"] + ": winter pressures (personal characteristics), October 2025 to January 2026", url="https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/debt/datasets/publicopinionsandsocialtrendsgreatbritainwinterpressuresbypersonalcharacteristics")
ONS_Q3 = "1 July to 27 September 2026"
ONS_POP = "Adults 16 and over in Great Britain"
FSA_SOURCE = {"name": "Food and You 2: Wave 11 (all-country tables)", "organisation": "Food Standards Agency", "url": "https://data.food.gov.uk/catalog/datasets/a6ba60ff-c9c6-4d13-9891-f9282e919cec",
              "derive": "derive/fsa.py", "aggregates": "derive/aggregates/fsa.json"}
FSA_W11 = "9 May to 7 August 2025"
FSA_POP = "Adults 16 and over in England, Wales and Northern Ireland"
DESNZ_SOURCE = {"name": "Public Attitudes Tracker: Spring 2026 (crosstabulations)", "organisation": "Department for Energy Security and Net Zero",
                "url": "https://www.gov.uk/government/statistics/desnz-public-attitudes-tracker-spring-2026", "derive": "derive/desnz.py", "aggregates": "derive/aggregates/desnz.json"}
DESNZ_WAVE = "16 March to 21 April 2026"
DESNZ_POP = "Adults 16 and over in the UK"
CES_SOURCE = {"name": "Community and Engagement Survey 2025/26: volunteering and charitable giving (data tables)",
              "organisation": "Department for Culture, Media and Sport", "url": "https://www.gov.uk/government/statistics/community-and-engagement-survey-202526-volunteering",
              "derive": "derive/ces.py", "aggregates": "derive/aggregates/ces.json"}
CES_POP = "Adults 16 and over in England"
SHED_POP = "US adults 18 and over living in households"
NHIS_POP = "US civilian adults 18 and over living in households"

STUDIES = [
    # ---- US, SHED 2024
    dict(id="shed-emergency-savings-3-months", out="shed", country="us", source=SHED_SOURCE, variables=["EF1"], surveyed="October 2024",
         title="Three months of emergency savings", population=SHED_POP, universe=[US_HOUSEHOLDS],
         question="Have you set aside emergency or rainy day funds that would cover your expenses for 3 months in case of sickness, job loss, economic downturn, or other emergencies?",
         options=["Yes", "No"], orderedLevels=0, excluded=["Refused"],
         drivers=["household_income_before_tax_per_year", "could_cover_an_unexpected_expense", "managing_financially", "age_years", "home_tenure",
                  "economic_activity_status", "highest_qualification"]),
    dict(id="shed-went-without-medical-care-cost", out="shed", country="us", source=SHED_SOURCE, variables=["E1_a", "E1_b", "E1_c", "E1_d", "E1_e"],
         surveyed="October 2024", title="Went without medical care because of cost", population=SHED_POP, universe=[US_HOUSEHOLDS],
         question="During the past 12 months, was there a time when you needed any of the following, but went without because you couldn't afford it: prescription medicine, seeing a doctor or specialist, mental health care or counseling, dental care, or follow-up care?",
         options=["Yes, went without at least one of these", "No"], orderedLevels=0, excluded=["Refused"],
         drivers=["health_insurance", "household_income_before_tax_per_year", "could_cover_an_unexpected_expense", "long_term_health_conditions",
                  "general_health", "age_years"]),
    dict(id="shed-buy-now-pay-later", out="shed", country="us", source=SHED_SOURCE, variables=["BNPL1"], surveyed="October 2024",
         title="Used buy now, pay later", population=SHED_POP, universe=[US_HOUSEHOLDS],
         question="In the past year, have you used a \"Buy Now Pay Later\" service to buy something?", options=["Yes", "No"], orderedLevels=0,
         excluded=["Refused"],
         drivers=["age_years", "household_income_before_tax_per_year", "could_cover_an_unexpected_expense", "unsecured_debt_excluding_student_loans",
                  "own_dependent_children_at_home", "online_activities_last_3_months", "home_tenure"]),
    dict(id="shed-retirement-savings-on-track", out="shed", country="us", source=SHED_SOURCE, variables=["K0", "D1I"], surveyed="October 2024",
         title="Retirement savings on track", population="US adults 18 and over living in households who do not consider themselves retired",
         universe=[US_HOUSEHOLDS, NOT_RETIRED],
         question="Do you think that your retirement savings plan is currently on track?", options=["Yes", "No", "Not sure"], orderedLevels=0,
         excluded=["Refused"],
         drivers=["household_income_before_tax_per_year", "age_years", "highest_qualification", "economic_activity_status", "employment_type",
                  "home_tenure", "managing_financially", "financial_planning_horizon"]),
    dict(id="shed-food-sufficiency", out="shed", country="us", source=SHED_SOURCE, variables=["FD3"], surveyed="October 2024",
         title="Enough food in the household", population=SHED_POP, universe=[US_HOUSEHOLDS],
         question="In the past month, which of these statements best describes the food eaten in your household?",
         options=["Enough of the kinds of food we wanted to eat", "Enough, but not always the kinds of food we wanted to eat", "Sometimes not enough to eat",
                  "Often not enough to eat"], orderedLevels=4, excluded=["Refused"],
         drivers=["household_income_before_tax_per_year", "managing_financially", "could_cover_an_unexpected_expense", "own_dependent_children_at_home",
                  "people_in_household", "economic_activity_status", "age_years"]),
    dict(id="shed-price-changes-effect", out="shed", country="us", source=SHED_SOURCE, variables=["INF4"], surveyed="October 2024",
         title="Effect of price changes on finances", population=SHED_POP, universe=[US_HOUSEHOLDS],
         question="Overall, have changes in the prices you pay compared to last year made your financial situation worse, better, or had little to no effect?",
         options=["Much worse", "Somewhat worse", "Little or no effect", "Better"], orderedLevels=4, excluded=["Refused"],
         note="\"Better\" joins the survey's \"Somewhat better\" (417 respondents) and \"Much better\" (115).",
         drivers=["household_income_before_tax_per_year", "managing_financially", "own_dependent_children_at_home", "home_tenure", "economic_activity_status",
                  "age_years"]),
    # ---- US, NHIS 2024
    dict(id="nhis-flu-vaccine-12-months", out="nhis", country="us", source=NHIS_SOURCE, variables=["SHTFLU12M_A"], surveyed="January to December 2024",
         title="Flu vaccination in the past year", population=NHIS_POP, universe=[US_HOUSEHOLDS, US_CIVILIAN],
         context="There are two types of flu vaccinations. One is a shot and the other is a spray, mist, or drop in the nose.",
         question="During the past 12 months, have you had a flu vaccination?", options=["Yes", "No"], orderedLevels=0,
         excluded=["Refused", "Not ascertained", "Don't know"],
         drivers=["age_years", "long_term_health_conditions", "health_insurance", "highest_qualification", "economic_activity_status",
                  "current_occupation_major_group"]),
    dict(id="nhis-worry-paying-medical-bills", out="nhis", country="us", source=NHIS_SOURCE, variables=["PAYWORRY_A"], surveyed="January to December 2024",
         title="Worry about paying medical bills", population=NHIS_POP, universe=[US_HOUSEHOLDS, US_CIVILIAN],
         question="If you get sick or have an accident, how worried are you that you will be able to pay your medical bills?",
         options=["Very worried", "Somewhat worried", "Not at all worried"], orderedLevels=3, excluded=["Refused", "Not ascertained", "Don't know"],
         drivers=["health_insurance", "household_income_before_tax_per_year", "could_cover_an_unexpected_expense", "managing_financially", "age_years",
                  "general_health", "day_to_day_activities_limited_by_health"]),
    dict(id="nhis-virtual-appointment-12-months", out="nhis", country="us", source=NHIS_SOURCE, variables=["VIRAPP12M_A"],
         surveyed="January to December 2024", title="Video or phone medical appointment in the past year", population=NHIS_POP,
         universe=[US_HOUSEHOLDS, US_CIVILIAN],
         question="During the past 12 months, have you had an appointment with a doctor, nurse, or other health professional by video or by phone?",
         options=["Yes", "No"], orderedLevels=0, excluded=["Refused", "Not ascertained", "Don't know"],
         drivers=["long_term_health_conditions", "day_to_day_activities_limited_by_health", "health_insurance", "highest_qualification",
                  "internet_use_frequency", "sex_at_birth", "usual_work_location"]),
    dict(id="nhis-loneliness-frequency", out="nhis", country="us", source=NHIS_SOURCE, variables=["LONELY_A"], surveyed="January to December 2024",
         title="How often lonely", population=NHIS_POP, universe=[US_HOUSEHOLDS, US_CIVILIAN],
         question="How often do you feel lonely?", options=["Always", "Usually", "Sometimes", "Rarely", "Never"], orderedLevels=5,
         excluded=["Refused", "Not ascertained", "Don't know"],
         drivers=["household_type", "couple_status", "people_in_household", "day_to_day_activities_limited_by_health", "long_term_health_conditions",
                  "economic_activity_status", "age_years", "big_five_neuroticism_quintile", "big_five_extraversion_quintile"]),
    dict(id="nhis-volunteered-12-months", out="nhis", country="us", source=NHIS_SOURCE, variables=["CEVOLUN1_A"], surveyed="January to December 2024",
         title="Volunteered for an organisation in the past year", population=NHIS_POP, universe=[US_HOUSEHOLDS, US_CIVILIAN],
         question="During the past 12 months, did you spend any time volunteering for any organization or association?", options=["Yes", "No"],
         orderedLevels=0, excluded=["Refused", "Not ascertained", "Don't know"],
         drivers=["highest_qualification", "importance_of_religion", "religion", "own_dependent_children_at_home", "household_income_before_tax_per_year",
                  "day_to_day_activities_limited_by_health", "age_years", "big_five_agreeableness_quintile"]),
    dict(id="nhis-e-cigarette-use", out="nhis", country="us", source=NHIS_SOURCE, variables=["SMKECIGST_A", "ECIGEV_A", "ECIGNOW_A"],
         surveyed="January to December 2024", title="E-cigarette use", population=NHIS_POP, universe=[US_HOUSEHOLDS, US_CIVILIAN],
         context="These questions are about electronic vaping products for nicotine, such as vape pens and JUULs; not marijuana.",
         question="Have you ever used an e-cigarette or other electronic vaping product, and do you use them now?",
         options=["Use them now, every day or some days", "Used them before, not now", "Never used them"], orderedLevels=0,
         excluded=["Unknown if ever used"],
         note="NCHS recode SMKECIGST_A of ECIGEV_A (ever used) and ECIGNOW_A (every day, some days, not at all).",
         drivers=["age_years", "smoking_status", "sex_at_birth", "highest_qualification", "household_income_before_tax_per_year", "economic_activity_status"]),
    # ---- UK, ONS Opinions and Lifestyle Survey
    dict(id="ons-loneliness-frequency", out="ons_opn", country="uk", source=ONS_WL, variables=["Wellbeing, Table 11"], surveyed=ONS_Q3,
         title="How often lonely", population=ONS_POP, universe=[UK_HOUSEHOLDS, UK_GB],
         question="How often do you feel lonely?", options=["Often or always", "Some of the time", "Occasionally", "Hardly ever", "Never"], orderedLevels=5,
         excluded=["Don't know", "Prefer not to say"],
         drivers=["household_type", "couple_status", "people_in_household", "day_to_day_activities_limited_by_health", "economic_activity_status",
                  "home_tenure", "age_years", "big_five_neuroticism_quintile", "big_five_extraversion_quintile"]),
    dict(id="ons-able-to-save-next-12-months", out="ons_opn", country="uk", source=ONS_HF, variables=["Household finances, Table 1"], surveyed=ONS_Q3,
         title="Expects to save in the next 12 months", population=ONS_POP, universe=[UK_HOUSEHOLDS, UK_GB],
         question="In view of the general economic situation, do you think you will be able to save any money in the next 12 months?",
         options=["Yes", "No", "Don't know"], orderedLevels=0, excluded=["Prefer not to say"],
         drivers=["household_income_before_tax_per_year", "personal_income_before_tax_per_year", "managing_financially", "could_cover_an_unexpected_expense",
                  "economic_activity_status", "home_tenure", "own_dependent_children_at_home", "financial_planning_horizon"]),
    dict(id="ons-borrowed-more-than-usual", out="ons_opn", country="uk", source=ONS_HF, variables=["Household finances, Table 3"], surveyed=ONS_Q3,
         title="Borrowed more than usual in the last month", population=ONS_POP, universe=[UK_HOUSEHOLDS, UK_GB],
         context="Borrowing or using credit includes credit cards, overdrafts, or taking out loans, borrowing from friends, family, neighbours or other personal connections.",
         question="Have you had to borrow more money or use more credit than usual in the last month, compared to a year ago?", options=["Yes", "No"],
         orderedLevels=0, excluded=["Don't know", "Prefer not to say"],
         drivers=["unsecured_debt_excluding_student_loans", "managing_financially", "could_cover_an_unexpected_expense", "household_income_before_tax_per_year",
                  "home_tenure", "own_dependent_children_at_home", "age_years"]),
    dict(id="ons-afford-rent-or-mortgage", out="ons_opn", country="uk", source=ONS_HF, variables=["Household finances, Table 10"], surveyed=ONS_Q3,
         title="Affording rent or mortgage payments", population="Adults 16 and over in Great Britain who are currently paying rent or mortgage payments",
         universe=[UK_HOUSEHOLDS, UK_GB, PAYS_HOUSING, HOUSEHOLDER],
         question="How easy or difficult is it to afford your rent or mortgage payments?", options=["Very easy", "Somewhat easy", "Somewhat difficult", "Very difficult"],
         orderedLevels=4, excluded=["Don't know", "Prefer not to say"],
         note="ONS asks people who currently pay rent or a mortgage; the universe approximates them as householders and partners in mortgaged, shared-ownership or rented homes.",
         drivers=["household_income_before_tax_per_year", "managing_financially", "home_tenure", "mortgage_balance_outstanding", "could_cover_an_unexpected_expense",
                  "own_dependent_children_at_home", "economic_activity_status", "region"]),
    dict(id="ons-kept-comfortably-warm", out="ons_opn", country="uk", source=ONS_WP, variables=["Winter pressures, Table 2"],
         surveyed="1 October 2025 to 4 January 2026", title="Kept comfortably warm at home", population=ONS_POP, universe=[UK_HOUSEHOLDS, UK_GB],
         question="In the past two weeks, how often were you able to keep comfortably warm in your home?",
         options=["Often or always", "Some of the time", "Occasionally", "Hardly ever or never"], orderedLevels=4, excluded=["Don't know", "Prefer not to say"],
         note="\"Hardly ever or never\" joins two published options (3% and 1%).",
         drivers=["household_income_before_tax_per_year", "managing_financially", "could_cover_an_unexpected_expense", "home_tenure", "accommodation_type",
                  "day_to_day_activities_limited_by_health", "economic_activity_status", "age_years"]),
    # ---- UK, FSA Food and You 2
    dict(id="fsa-worried-food-would-run-out", out="fsa", country="uk", source=FSA_SOURCE, variables=["FOODSEC1 (table 217)"], surveyed=FSA_W11,
         title="Worried food would run out", population=FSA_POP, universe=[UK_HOUSEHOLDS, UK_EWNI],
         context="Please say whether the statement below was often true, sometimes true or never true for you or people in your household in the last 12 months.",
         question="\"I / we worried whether our food would run out before we got money to buy more.\"", options=["Often true", "Sometimes true", "Never true"],
         orderedLevels=3, excluded=["Don't know or prefer not to say"],
         drivers=["household_income_before_tax_per_year", "managing_financially", "could_cover_an_unexpected_expense", "own_dependent_children_at_home",
                  "people_in_household", "economic_activity_status", "day_to_day_activities_limited_by_health", "home_tenure", "age_years"]),
    dict(id="fsa-checks-animal-welfare-info", out="fsa", country="uk", source=FSA_SOURCE, variables=["DEFRA4_1 (table 236)"], surveyed=FSA_W11,
         title="Checks animal welfare information when buying food", population=FSA_POP, universe=[UK_HOUSEHOLDS, UK_EWNI],
         question="When purchasing food, how often do you check for information on animal welfare?",
         options=["Always", "Most of the time", "About half the time", "Occasionally", "Never"], orderedLevels=5, excluded=["Don't know"],
         drivers=["household_income_before_tax_per_year", "highest_qualification", "dietary_practices", "reads_product_details_before_buying",
                  "compares_prices_before_buying", "sex_at_birth", "age_years", "big_five_openness_quintile"]),
    # ---- UK, DESNZ Public Attitudes Tracker
    dict(id="desnz-worry-paying-energy-bills", out="desnz", country="uk", source=DESNZ_SOURCE, variables=["PAYBILLEN"], surveyed=DESNZ_WAVE,
         title="Worry about paying energy bills", population=DESNZ_POP, universe=[UK_HOUSEHOLDS],
         question="Over the last three months, how worried, if at all, have you been about paying for energy bills (gas/electricity)?",
         options=["Very worried", "Fairly worried", "Not very worried", "Not at all worried", "Not applicable (I don't pay them) or don't know"], orderedLevels=4,
         excluded=["Prefer not to say"],
         note="The survey's \"Not applicable/Don't know\" is kept as an option: most of it is people who do not pay the bills (45% of 16 to 24 year olds).",
         drivers=["household_income_before_tax_per_year", "managing_financially", "could_cover_an_unexpected_expense", "position_in_household", "home_tenure",
                  "accommodation_type", "day_to_day_activities_limited_by_health", "age_years"]),
    dict(id="desnz-concern-about-climate-change", out="desnz", country="uk", source=DESNZ_SOURCE, variables=["CLIMCONCERN"], surveyed=DESNZ_WAVE,
         title="Concern about climate change", population=DESNZ_POP, universe=[UK_HOUSEHOLDS],
         question="How concerned, if at all, are you about climate change, sometimes referred to as 'global warming'?",
         options=["Very concerned", "Fairly concerned", "Not very concerned", "Not at all concerned"], orderedLevels=4, excluded=["Don't know"],
         drivers=["highest_qualification", "political_ideology", "party_identification", "age_years", "sex_at_birth", "big_five_openness_quintile",
                  "has_children"]),
    # ---- UK, DCMS Community and Engagement Survey
    dict(id="ces-formal-volunteering-12-months", out="ces", country="uk", source=CES_SOURCE, variables=["ForvolTotal_DV (table G4)"],
         surveyed="15 October 2025 to March 2026", title="Formal volunteering in the last 12 months", population=CES_POP,
         universe=[UK_HOUSEHOLDS, UK_ENGLAND],
         context="Groups, clubs and organisations include, for example, children's education or schools, youth activities, sport or exercise, religion, "
                 "politics, older people, health or social welfare, the environment or animals, local community groups, hobbies or social clubs, and trade unions.",
         question="In the last 12 months, have you given any unpaid help to any groups, clubs or organisations: for example raising money, leading a group "
                  "or being on a committee, organising or helping to run an activity or event, visiting or befriending people, giving advice, admin work, "
                  "providing transport, or other practical help?",
         options=["Yes", "No"], orderedLevels=0, excluded=[],
         note="DCMS's derived measure (formal volunteering in the last 12 months): involved in a group, club or organisation and gave it unpaid help in "
              "any of 13 listed ways. The question joins the survey's two steps; the examples are the survey's own lists (table G18).",
         drivers=["highest_qualification", "home_tenure", "religion", "importance_of_religion", "age_years", "own_dependent_children_at_home",
                  "economic_activity_status", "household_income_before_tax_per_year", "big_five_agreeableness_quintile"]),
]


def load_outputs():
    outs = {}
    for name in os.listdir(os.path.join(HERE, "aggregates")):
        if name.endswith(".json"):
            outs[name[:-5]] = json.load(open(os.path.join(HERE, "aggregates", name)))
    return outs


def build():
    outs = load_outputs()
    studies = []
    for spec in STUDIES:
        out = outs[spec["out"]]
        got = out["studies"][spec["id"]]
        defs = out["group_definitions"]
        groups = []
        for dim, (dim_label, labels) in DIMENSIONS.items():
            have = got["groups"].get(dim)
            if not have or spec.get("skip_groups") and dim in spec["skip_groups"]:
                continue
            buckets = [{"label": labels[g], "match": defs[dim][g], "real": have[g]["real"], "n": have[g]["n"]} for g in labels if g in have]
            if len(buckets) >= 2:
                groups.append({"dimension": dim_label, "buckets": buckets})
        for dim in spec.get("extra_dimensions", []):
            dim_label, labels = spec["extra_dimensions"][dim]
            have = got["groups"][dim]
            groups.append({"dimension": dim_label, "buckets": [{"label": labels[g], "match": defs[dim][g], "real": have[g]["real"], "n": have[g]["n"]}
                                                               for g in labels if g in have]})
        study = {k: spec[k] for k in ("id", "title") if k in spec}
        study["source"] = dict(spec["source"], variables=spec["variables"])
        for k in ("country", "population", "universe", "surveyed"):
            study[k] = spec[k]
        study["context"] = spec.get("context", "")
        for k in ("question", "options", "orderedLevels"):
            study[k] = spec[k]
        study["real"] = got["real"]
        study["n"] = got["n"]
        study["excluded"] = spec["excluded"]
        if spec.get("note"):
            study["note"] = spec["note"]
        study["drivers"] = spec["drivers"]
        study["groups"] = groups
        studies.append(study)
    for country in sorted({s["country"] for s in studies}):
        ids = sorted(s["id"] for s in studies if s["country"] == country)
        random.Random(SEED).shuffle(ids)
        dev = set(ids[: len(ids) // 2])
        for s in studies:
            if s["country"] == country:
                s["split"] = "dev" if s["id"] in dev else "test"
    return {"version": "v4-1", "built_by": "benchmarks/v4/derive/build.py",
            "split": {"seed": SEED, "rule": "for each country: sort its study ids, shuffle them with Python 3 random.Random(seed).shuffle, the first half (rounded down) is dev, the rest test"},
            "studies": studies}


def check(doc, schema_path):
    problems = []
    fields = None
    if schema_path:
        schema = json.load(open(schema_path))
        fields = {f["name"]: f for f in schema["fields"]}

    def rule_ok(rule, country, where):
        if fields is None:
            return
        f = fields.get(rule["field"])
        if f is None or country not in f["countries"]:
            problems.append(f"{where}: field {rule['field']} is not a 4.0 field for {country}")
            return
        if "in" in rule:
            allowed = {v["code"] if isinstance(v, dict) else v for v in f["values"].get(country, [])}
            bad = [v for v in rule["in"] if v not in allowed]
            if bad:
                problems.append(f"{where}: {rule['field']} has no values {bad} for {country}")
        else:
            num = f.get("numeric") or {}
            if not ("min" in rule and "max" in rule) or rule["min"] < num.get("min", -1e9) or rule["max"] > num.get("max", 1e9):
                problems.append(f"{where}: range {rule} outside {rule['field']} numeric domain {num}")

    def dist_ok(real, k, where):
        if len(real) != k:
            problems.append(f"{where}: {len(real)} shares for {k} options")
        if abs(sum(real) - 100) > 0.15:
            problems.append(f"{where}: shares sum to {sum(real):.2f}")

    for s in doc["studies"]:
        k = len(s["options"])
        if k > 6:
            problems.append(f"{s['id']}: {k} options")
        dist_ok(s["real"], k, s["id"])
        for rule in s["universe"]:
            rule_ok(rule, s["country"], f"{s['id']} universe")
        for g in s["groups"]:
            for b in g["buckets"]:
                where = f"{s['id']} {g['dimension']}/{b['label']}"
                rule_ok(b["match"], s["country"], where)
                dist_ok(b["real"], k, where)
                if b["n"] < MIN_N:
                    problems.append(f"{where}: n {b['n']} under {MIN_N}")
        for d in s["drivers"]:
            if fields is not None and (d not in fields or s["country"] not in fields[d]["countries"]):
                problems.append(f"{s['id']}: driver {d} is not a 4.0 field for {s['country']}")
    for country in sorted({s["country"] for s in doc["studies"]}):
        splits = [s["split"] for s in doc["studies"] if s["country"] == country]
        if abs(splits.count("dev") - splits.count("test")) > 1:
            problems.append(f"{country}: split {splits.count('dev')} dev / {splits.count('test')} test")
    return problems


def main(args):
    schema_path = args[args.index("--schema") + 1] if "--schema" in args else DEFAULT_SCHEMA
    if not os.path.exists(schema_path):
        raise SystemExit(f"schema not found at {schema_path}; pass --schema")
    doc = build()
    problems = check(doc, schema_path)
    with open(os.path.join(V4, "studies.json"), "w") as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
        f.write("\n")
    by = {}
    for s in doc["studies"]:
        by.setdefault((s["country"], s["split"]), []).append(s["id"])
    for key, ids in sorted(by.items()):
        print(key, len(ids), ids)
    if problems:
        print("\n".join(problems))
        raise SystemExit(f"{len(problems)} problems")
    print(f"{len(doc['studies'])} studies, all checks passed")


if __name__ == "__main__":
    main(sys.argv[1:])
