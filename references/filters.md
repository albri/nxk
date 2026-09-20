# PersonaGen filters

Package/schema contract `3.0.0`; generator `v2`.
78 UK fields; 77 US fields. Read the group relevant to the task.

This catalogue comes from the complete PersonaGen capability manifest.
The live `GET /{country}/capabilities` response carries the same fields in
`filter_catalogue`. If the two disagree, use the response.
Use the values below, then check a small draw when using a new combination.
Occupation titles and codes use the live facet search described in
[persona-generation.md](persona-generation.md#find-the-right-filters).

Pass categorical values as arrays of strings, including `has_children: ["true"]`.
Values within a field are OR; fields are AND. `age` takes `{min, max}`.
For dog AND cat ownership use `pet_type_combo: ["dog_and_cat"]`;
`pet_types: ["dog", "cat"]` means either species.

These are generated profiles. Financial pressure, shopping style, privacy
posture, employer context and similar fields are inferred context. They do
not establish a real purchase history, company budget or use of a named product.
Personal income and household resources are different; choose the one the
decision depends on. `social_grade` is UK-only.

## People and place

| Field | Accepted values |
| --- | --- |
| `age` | `{min, max}`, 18–120 |
| `age_group` | `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65_plus` |
| `gender` | `male`, `female`, `non_binary`, `transgender_male`, `transgender_female`, `genderfluid`, `agender` |
| `ethnicity` | UK: `white_british`, `white_irish`, `white_other`, `mixed_or_multiple_ethnic_groups`, `asian_indian`, `asian_pakistani`, `asian_bangladeshi`, `asian_chinese`, `asian_other`, `black_african`, `black_caribbean`, `black_other`, `arab`, `other_ethnic_group`<br>US: `white`, `hispanic_latino`, `native_american`, `middle_eastern_north_african`, `pacific_islander`, `multiracial`, `black_american`, `black_caribbean`, `black_african`, `east_asian`, `southeast_asian`, `south_asian` |
| `location` | UK: `north_east_england`, `north_west_england`, `yorkshire_and_the_humber`, `east_midlands`, `west_midlands`, `east_of_england`, `london`, `south_east_england`, `south_west_england`, `scotland`, `wales`, `northern_ireland`<br>US: `alabama`, `alaska`, `arizona`, `arkansas`, `california`, `colorado`, `connecticut`, `delaware`, `district_of_columbia`, `florida`, `georgia`, `hawaii`, `idaho`, `illinois`, `indiana`, `iowa`, `kansas`, `kentucky`, `louisiana`, `maine`, `maryland`, `massachusetts`, `michigan`, `minnesota`, `mississippi`, `missouri`, `montana`, `nebraska`, `nevada`, `new_hampshire`, `new_jersey`, `new_mexico`, `new_york`, `north_carolina`, `north_dakota`, `ohio`, `oklahoma`, `oregon`, `pennsylvania`, `rhode_island`, `south_carolina`, `south_dakota`, `tennessee`, `texas`, `utah`, `vermont`, `virginia`, `washington`, `west_virginia`, `wisconsin`, `wyoming`, `puerto_rico` |
| `geographic_context` | `major_metropolitan`, `metropolitan_urban`, `suburban`, `small_city`, `small_town`, `rural` |
| `education` | UK: `no_formal_qualification`, `gcse_or_equivalent`, `a_level_or_equivalent`, `vocational_or_apprenticeship`, `undergraduate_degree`, `postgraduate_degree`, `professional_qualification`<br>US: `less_than_high_school`, `high_school_graduate`, `some_college_no_degree`, `associate_degree`, `bachelor_degree`, `master_degree`, `professional_degree`, `doctoral_degree` |
| `employment_status` | UK: `employed_full_time`, `employed_part_time`, `self_employed`, `unemployed_seeking`, `unemployed_not_seeking`, `student`, `retired`, `homemaker_or_carer`, `long_term_sick_or_disabled`, `other_economically_inactive`<br>US: `employed_full_time`, `employed_part_time`, `self_employed`, `unemployed_looking`, `unemployed_not_looking`, `retired`, `student`, `homemaker`, `unable_to_work`, `military_active` |
| `occupational_background` | `technology_computing`, `engineering_technical`, `healthcare_medical`, `science_research`, `education_teaching`, `business_finance`, `management_leadership`, `legal_professional`, `public_administration_civil_service`, `public_safety_security`, `arts_creative_media`, `sales_marketing`, `service_hospitality`, `personal_care_services`, `skilled_trades_construction`, `manufacturing_production`, `transportation_logistics`, `agriculture_natural_resources`, `administrative_clerical`, `social_community_services`, `religious_clergy`, `military_veteran`, `homemaker_caregiver`, `none` |

## Work and employer context

| Field | Accepted values |
| --- | --- |
| `occupation_code` | Facet lookup: UK 360, US 911 values |
| `canonical_role` | Facet lookup: UK 360, US 911 values |
| `occupation_title` | Facet lookup: UK 1,803, US 4,560 values |
| `work_location_mode` | `on_site`, `hybrid`, `remote`, `field_based`, `variable`, `not_applicable` |
| `military_service_status` | UK: `none`, `veteran_or_prior_service`<br>US: `none`, `currently_serving`, `veteran_or_prior_service` |
| `public_sector_context` | `none`, `possible`, `strong` |
| `career_context_scope` | `current_role`, `former_role` |
| `career_seniority` | `entry`, `mid`, `senior`, `executive` |
| `management_scope` | `individual_contributor`, `team_manager`, `senior_manager`, `executive` |
| `business_ownership_status` | UK: `executive_owner_possible`, `freelancer`, `not_owner`, `owner_operator`<br>US: `executive_owner_possible`, `freelancer`, `not_owner` |
| `employer_type` | `education_or_health_institution`, `household_or_private_client`, `nonprofit_or_community`, `private_company`, `public_sector`, `self_employed_or_own_business` |
| `company_size_band` | `enterprise`, `large`, `medium`, `micro`, `public_sector_or_institutional`, `small`, `solo` |
| `startup_stage_context` | `growth_company_possible`, `none`, `startup_possible` |
| `decision_role` | `budget_owner`, `decision_maker`, `influencer`, `low` |
| `employer_context_confidence` | `high`, `medium` |
| `sector_tags` | UK: `construction`, `education`, `finance`, `food_service`, `healthcare`, `legal`, `marketing`, `production_transport`, `retail`, `sales_retail`, `skilled_trades`, `software`, `technology`<br>US: `agriculture`, `children_family`, `construction`, `data`, `education`, `finance`, `food_service`, `healthcare`, `hospitality`, `legal`, `manufacturing`, `marketing`, `retail`, `sales_retail`, `software`, `technology`, `transportation_logistics` |

## Money and resources

| Field | Accepted values |
| --- | --- |
| `personal_income_band` | UK: `under_20k_gbp`, `20k_to_35k_gbp`, `35k_to_50k_gbp`, `50k_to_70k_gbp`, `70k_to_100k_gbp`, `100k_to_150k_gbp`, `over_150k_gbp`<br>US: `under_25k_usd`, `25k_to_50k_usd`, `50k_to_75k_usd`, `75k_to_100k_usd`, `100k_to_150k_usd`, `150k_to_200k_usd`, `over_200k_usd` |
| `income_source` | UK: `employment_wages`, `self_employment`, `private_or_workplace_pension`, `state_pension`, `investment_passive`, `jobseekers_or_out_of_work_support`, `household_support`, `benefits_or_universal_credit`, `student_finance`<br>US: `employment_wages`, `self_employment`, `social_security`, `retirement_pension`, `investment_passive`, `unemployment_benefit`, `household_support`, `benefits`, `student_aid` |
| `current_earned_income_source` | `employment_wages`, `self_employment`, `none_or_not_applicable` |
| `social_grade` | UK: `ab`, `c1`, `c2`, `de`<br>US: unsupported |
| `household_support_model` | `fully_independent`, `family_supported`, `shared_household_costs`, `partner_supported_or_shared_costs`, `retirement_income_supported`, `state_or_supported_housing_buffer`, `mixed_support_model` |
| `economic_dependency_role` | `primary_personal_earner`, `shared_household_earner`, `partner_supported_non_earner`, `family_supported_dependent`, `student_family_supported`, `retired_pension_supported`, `state_support_primary`, `self_funded_non_worker`, `mixed_or_unclear_support` |
| `household_resource_context` | `low_household_resources`, `modest_household_resources`, `middle_household_resources`, `high_household_resources`, `very_high_household_resources` |
| `household_income_band_estimate` | UK: `under_20k_gbp`, `20k_to_35k_gbp`, `35k_to_50k_gbp`, `50k_to_70k_gbp`, `70k_to_100k_gbp`, `100k_to_150k_gbp`, `over_150k_gbp`<br>US: `under_25k_usd`, `25k_to_50k_usd`, `50k_to_75k_usd`, `75k_to_100k_usd`, `100k_to_150k_usd`, `150k_to_200k_usd`, `over_200k_usd` |
| `financial_planning_style` | `no_formal_planning`, `paycheck_to_paycheck`, `basic_budgeting`, `structured_budgeting`, `long_term_planning`, `investment_oriented` |
| `debt_load_context` | `low_or_no_debt`, `manageable_debt`, `asset_or_education_backed_debt`, `consumer_credit_pressure`, `high_debt_burden` |
| `financial_pressure_context` | `financially_secure`, `stable_with_commitments`, `budget_managed`, `financially_constrained`, `high_financial_pressure` |

## Family and home

| Field | Accepted values |
| --- | --- |
| `relationship_status` | `single_never_married`, `married`, `divorced`, `widowed`, `separated`, `registered_partnership`, `cohabiting_partner` |
| `number_of_children` | `none`, `one`, `two`, `three_plus` |
| `homeownership_status` | UK: `own_outright`, `own_with_mortgage`, `private_rent`, `social_housing_rent`, `living_with_family_no_rent`, `temporary_or_supported_housing`<br>US: `own_outright`, `own_with_mortgage`, `rent_market_rate`, `rent_subsidized`, `occupancy_no_rent`, `transitional_housing` |
| `housing_type` | UK: `detached_house`, `semi_detached_house`, `terraced_house`, `flat_apartment`, `bungalow`, `group_or_supported_housing`, `temporary_housing`<br>US: `single_family_house`, `apartment`, `condominium`, `townhouse`, `mobile_home`, `group_quarters`, `temporary_housing` |
| `has_children` | `true`, `false` |
| `dependent_children_count_band` | `none`, `one`, `two`, `three_plus` |
| `child_age_bands` | `infant`, `toddler`, `preschool`, `primary_school`, `secondary_school`, `adult_child` |
| `youngest_child_age_band` | `infant`, `toddler`, `preschool`, `primary_school`, `secondary_school`, `adult_child` |
| `oldest_child_age_band` | `infant`, `toddler`, `preschool`, `primary_school`, `secondary_school`, `adult_child` |
| `parenting_stage` | `no_children`, `new_parent`, `preschool_parent`, `primary_school_parent`, `secondary_school_parent`, `parent_of_adult_children`, `mixed_dependent_and_adult_children` |
| `child_household_presence` | `no_children`, `dependent_children_at_home`, `shared_custody_or_part_time`, `adult_children_at_home`, `adult_children_elsewhere`, `mixed_dependent_and_adult_children` |
| `family_lifecycle_stage` | `young_single_adult`, `young_couple_no_children`, `working_age_single_no_children`, `working_age_couple_no_children`, `dual_income_no_children`, `new_parent`, `preschool_family`, `primary_school_family`, `secondary_school_family`, `mixed_age_children_family`, `single_parent_family`, `adult_children_at_home`, `empty_nester`, `retired_no_children`, `retired_with_adult_children`, `other_lifecycle` |
| `relationship_household_context` | `partnered_without_current_children`, `partnered_with_current_children`, `unpartnered_without_current_children`, `unpartnered_with_current_children`, `shared_custody_parent`, `adult_children_elsewhere_partnered`, `adult_children_elsewhere_unpartnered`, `adult_children_at_home_partnered`, `adult_children_at_home_unpartnered`, `young_adult_family_home`, `shared_household_unpartnered`, `supported_or_temporary_household`, `other_relationship_household_context` |
| `current_partnership_state` | `unpartnered`, `married_or_civil_partnered`, `cohabiting_partnered`, `separated_not_cohabiting` |
| `relationship_history_context` | `unpartnered_never_married`, `currently_partnered_history_unobserved`, `divorced_or_separated_unpartnered`, `widowed_unpartnered`, `formerly_partnered_parent`, `relationship_history_unobserved`, `complex_or_unknown_relationship_history` |
| `partnership_household_role` | `partnered_shared_household`, `partnered_supported_by_partner`, `partnered_primary_or_shared_supporter`, `unpartnered_living_independently`, `unpartnered_current_parent_household`, `unpartnered_adult_children_at_home`, `unpartnered_adult_children_elsewhere`, `separated_or_shared_custody_parent`, `formerly_partnered_empty_nester`, `young_adult_family_home`, `shared_household_unpartnered`, `supported_or_temporary_household`, `other_partnership_household_role` |
| `household_composition` | `single_no_children`, `single_with_children`, `couple_no_children`, `couple_with_children`, `other_household` |
| `life_stage_segment` | `emerging_adult`, `early_career`, `family_building`, `established_family`, `midlife`, `later_life_active`, `retirement` |
| `caregiving_role` | `none`, `primary_childcare_caregiver`, `primary_adult_or_family_caregiver`, `mixed_family_caregiver`, `household_management_non_earner` |
| `garden_or_outdoor_space` | `no_private_outdoor_space`, `shared_or_limited_outdoor_space`, `private_garden_or_yard` |
| `recent_mover` | `moved_within_last_year`, `moved_1_to_3_years_ago`, `settled_3_plus_years` |
| `renovation_status` | `not_renovating`, `planning_renovation`, `currently_renovating`, `recently_completed_renovation` |
| `household_living_state` | `living_with_family`, `shared_household`, `living_alone`, `living_with_partner`, `single_parent_household`, `family_household`, `supported_or_temporary`, `other_household_state` |
| `dependency_state` | `dependent`, `partially_independent`, `independent` |

## Pets and travel

| Field | Accepted values |
| --- | --- |
| `pet_types` | `dog`, `cat`, `rabbit`, `small_mammal`, `bird`, `fish`, `reptile_or_exotic`, `other_pet` |
| `pet_type_combo` | `any_pet`, `dog_only`, `cat_only`, `dog_and_cat`, `other_only`, `dog_with_other`, `cat_with_other`, `dog_cat_and_other`, `no_pet` |
| `pet_owner_intensity` | `none`, `casual_owner`, `routine_owner`, `high_commitment_owner` |
| `car_access` | `no_regular_car_access`, `shared_household_car_access`, `personal_or_primary_car_access`, `multiple_vehicle_household_access` |
| `commute_pattern` | `not_applicable`, `home_based_worker`, `hybrid_commuter`, `regular_commuter`, `field_or_variable_travel` |

## Shopping and digital life

| Field | Accepted values |
| --- | --- |
| `price_sensitivity` | `discount_oriented`, `value_conscious`, `value_balanced`, `quality_led`, `premium_led` |
| `purchase_channel_preference` | `online_primary`, `in_store_preferred`, `hybrid_shopper`, `local_service_oriented`, `subscription_convenience` |
| `brand_loyalty_orientation` | `low_brand_loyalty_deal_switcher`, `repertoire_shopper`, `trusted_brand_preference`, `high_brand_loyalty`, `premium_brand_oriented` |
| `promotion_responsiveness` | `low_promotion_responsiveness`, `selective_promotion_responsiveness`, `deal_triggered_responsiveness`, `loyalty_reward_responsive`, `high_promotion_responsiveness` |
| `communication_preference` | `concise_direct`, `warm_relational`, `evidence_data_led`, `visual_story_led`, `community_peer_led` |
| `message_processing_style` | `heuristic_fast`, `balanced_mixed`, `analytical_deliberate` |
| `purchase_risk_tolerance` | `risk_averse`, `risk_balanced`, `risk_tolerant` |
| `digital_capability_level` | `limited_digital_capability`, `basic_digital_capability`, `everyday_digital_capability`, `advanced_digital_capability`, `expert_digital_capability` |
| `digital_engagement_intensity` | `offline_minimal`, `essential_light`, `selective_moderate`, `mobile_heavy`, `high_multi_platform` |
| `digital_privacy_posture` | `low_privacy_concern`, `pragmatic_privacy_management`, `privacy_selective`, `privacy_controlled`, `offline_privacy_avoidant` |
| `technology_adoption_orientation` | `late_adopter`, `cautious_late_majority`, `mainstream_adopter`, `early_adopter`, `power_user_innovator` |

## Activity

| Field | Accepted values |
| --- | --- |
| `activity_routine_context` | `sedentary_routine`, `light_activity_routine`, `moderate_regular_activity`, `highly_active_routine`, `limited_by_health_or_mobility` |
| `fitness_engagement_level` | `not_engaged`, `casual`, `routine`, `enthusiast` |

## Other profile fields

Profiles also include interests, languages, origin, personality, literacy,
numeracy, specific health/dietary context and appearance. These are not
generation-time filters. Use relevant emitted context when evaluating a
person; do not send an arbitrary profile path as a filter.

The country field references describe the complete payload:
[UK](https://personagen.dev/docs/uk/persona-structure),
[US](https://personagen.dev/docs/us/persona-structure).

## Maintaining this file

Generated from `dist/capability.json` in the PersonaGen package, which is built
from `buildPersonaFilterCapabilityManifest()`. This is maintainer tooling;
using nxk does not require the PersonaGen source repo.

Run `node scripts/generate-catalogue.mjs /path/to/capability.json`.
Add `--check` to compare without writing. Groups and lookup fields come from
the manifest, so a new field needs no change here. Check API behaviour before
publishing an updated catalogue; a package artifact alone does not prove
deployment.
