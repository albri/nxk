# Sources

Every number in `studies.json` comes from one of the downloads below, through the script named with it. Retrieval date for all: 2026-11-11.
Respondent-level files were downloaded and tabulated on a separate machine (the hub) and deleted with the job; only the aggregates in
`derive/aggregates/` came back. Published tables (aggregates already) were read on the Mac.

## Used

### US

| Source | File and URL | Licence | Size | sha256 | Script |
|---|---|---|---|---|---|
| Federal Reserve Board, Survey of Household Economics and Decisionmaking (SHED) 2024, public use data. Fieldwork October 2024, Ipsos KnowledgePanel, 12,295 adults 18+. | `SHED_public_use_data_2024_(CSV).zip` (member `public2024.csv`), <https://www.federalreserve.gov/consumerscommunities/files/SHED_public_use_data_2024_(CSV).zip> (server `Last-Modified` 2026-02-09) | Public domain (US federal government work; the Board asks for the citation in the codebook). No account, no click-through. | 3,787,684 bytes | `b455d02356a0c01a02d7f478c02d772515491564e905ce13db55f272f83567c1` | `derive/shed.py` (hub) |
| National Center for Health Statistics, National Health Interview Survey (NHIS) 2024, sample adult file. Interviews January to December 2024, 32,629 adults 18+. | `adult24csv.zip` (member `adult24.csv`), <https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NHIS/2024/adult24csv.zip> (server `Last-Modified` 2025-06-30) | Public domain (US federal government work). NCHS's public-use data restrictions apply (use for statistical analysis only, no attempt to identify anyone); no account, no click-through. | 5,543,360 bytes | `5f926b2ec0af508fa84ebc791c83bfefa6f020724754aab599004706981abdaf` | `derive/nhis.py` (hub) |

Documentation read on the Mac (not data): the SHED 2024 codebook (as text in the PersonaGen evidence folder,
`real-control-2026-11-11/shed/shed-2024-codebook.txt`); the NHIS 2024 sample adult codebook
(<https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Dataset_Documentation/NHIS/2024/Adult-codebook.pdf>, version 18 June 2025) and the imputed income
file summary (`Adultinc-summary.pdf`, same folder); the Board's report *Economic Well-Being of U.S. Households in 2024* (May 2025,
<https://www.federalreserve.gov/publications/files/2024-report-economic-well-being-us-households-202505.pdf>); NCHS, *Early Release of Selected
Estimates Based on Data From the 2024 National Health Interview Survey* (June 2025,
<https://www.cdc.gov/nchs/data/nhis/earlyrelease/earlyrelease202506.pdf>).

### UK

Published tables only (open respondent-level files found but not used, and the UK Data Service, are listed under Rejected). All
Crown copyright under the Open Government Licence v3.0, as each landing page states; no account, no click-through. Each file was downloaded
twice on 2026-11-11 (once to scout, once by its script from a clean folder); both copies match the pinned sha256.

| Source | File and URL | Licence | Size | sha256 | Script |
|---|---|---|---|---|---|
| Office for National Statistics, Opinions and Lifestyle Survey: *Public opinions and social trends, Great Britain: household finances by personal characteristics*, edition 1 July to 27 September 2026 (released 16 October 2026). Adults 16+ in Great Britain, sampled from previous ONS surveys (a probability sample), online and telephone. Landing page: <https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/debt/datasets/publicopinionsandsocialtrendsgreatbritainhouseholdfinancesbypersonalcharacteristics> | `householdfinancesbypersonalcharacteristics1julyto27september2026.xlsx` (saved as `hf_pc_jul_sep2026.xlsx`), <https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/personalandhouseholdfinances/debt/datasets/publicopinionsandsocialtrendsgreatbritainhouseholdfinancesbypersonalcharacteristics/1julyto27september2026/householdfinancesbypersonalcharacteristics1julyto27september2026.xlsx> | OGL v3.0 | 219,146 bytes | `e6aeccc5b66cdfc29b7ef3eb28d05fb9ebdbdb66e607e53f7920c35fe9d626ca` | `derive/ons_opn.py` |
| ONS, same survey: *personal well-being and loneliness by personal characteristics*, edition 1 July to 27 September 2026. Landing page: <https://www.ons.gov.uk/peoplepopulationandcommunity/healthandsocialcare/healthandwellbeing/datasets/publicopinionsandsocialtrendsgreatbritainpersonalwellbeingandlonelinessbypersonalcharacteristics> | `personalwellbeingandlonelinessbypersonalcharacteristics1julyto27september2026.xlsx` (saved as `wl_pc_jul_sep2026.xlsx`), <https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/healthandsocialcare/healthandwellbeing/datasets/publicopinionsandsocialtrendsgreatbritainpersonalwellbeingandlonelinessbypersonalcharacteristics/1julyto27september2026/personalwellbeingandlonelinessbypersonalcharacteristics1julyto27september2026.xlsx> | OGL v3.0 | 174,206 bytes | `b9997dc354f8f7c7429a0d798b78bd45136d6c92f06ea7bec5cf197550ed563a` | `derive/ons_opn.py` |
| ONS, same survey: *winter pressures by personal characteristics*, edition 1 October 2025 to 4 January 2026. Landing page: <https://www.ons.gov.uk/peoplepopulationandcommunity/personalandhouseholdfinances/debt/datasets/publicopinionsandsocialtrendsgreatbritainwinterpressuresbypersonalcharacteristics> | `winterpressuresbypersonalcharacteristics1october2025to4january2026.xlsx` (saved as `wp_pc_oct25_jan26.xlsx`), <https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/personalandhouseholdfinances/debt/datasets/publicopinionsandsocialtrendsgreatbritainwinterpressuresbypersonalcharacteristics/1october2025to4january2026/winterpressuresbypersonalcharacteristics1october2025to4january2026.xlsx> | OGL v3.0 | 78,584 bytes | `193a986ec4d8f5026d0082bf82960711efc93f6bfa5464df52d11c0207a7213a` | `derive/ons_opn.py` |
| Food Standards Agency, *Food and You 2: Wave 11*, all-country tables (England, Wales and Northern Ireland). Ipsos, push-to-web with postal option from the Postcode Address File, adults 16+. The workbook's cover gives fieldwork as 9 May to 7 August 2025; the catalogue entry says 19 May to 7 August 2025 (`studies.json` uses the workbook's). Catalogue entry: <https://data.food.gov.uk/catalog/datasets/a6ba60ff-c9c6-4d13-9891-f9282e919cec> | `W11_allCountry_pub_251217.xlsx`, <https://fsaopendata.blob.core.windows.net/opendatacatalog/W11_allCountry_pub_251217.xlsx> (server `Last-Modified` 2026-04-08) | OGL v3.0 (catalogue: "Open Government Licence (v3)") | 2,982,249 bytes | `22867c92a4fedb417e9f0432382a3d77b3de60dc10691a29f9efbeada723e536` | `derive/fsa.py` |
| Department for Energy Security and Net Zero, *Public Attitudes Tracker: Spring 2026*, crosstabulations (UK), published 2 July 2026. Fieldwork 16 March to 21 April 2026; stratified random sample of addresses from the Postcode Address File, push-to-web with targeted paper questionnaires; 3,389 adults 16+. Landing page: <https://www.gov.uk/government/statistics/desnz-public-attitudes-tracker-spring-2026> | `DESNZ_Public_Attitudes_Tracker_-_Crosstabulations__Spring_2026__UK.xlsx` (saved as `crosstabs_spring2026.xlsx`), <https://assets.publishing.service.gov.uk/media/6a4268213413112faed80dea/DESNZ_Public_Attitudes_Tracker_-_Crosstabulations__Spring_2026__UK.xlsx> (server `Last-Modified` 2026-06-29) | OGL v3.0 | 398,464 bytes | `6d80f0f8bddb59421e7e2d3a106904c275ea1506fb07a9207eaf0b62bf2a788e` | `derive/desnz.py` |
| Department for Culture, Media and Sport, *Community and Engagement Survey 2025/26: volunteering and charitable giving*, data tables, published 31 July 2026 (page last updated 16 September 2026; the tables, per that page, unaffected). Replaced the Community Life Survey and the Participation Survey in October 2025. Fieldwork 15 October 2025 to March 2026; stratified random sample of addresses from the Postcode Address File, push-to-web with targeted paper questionnaires (technical report, updated 11 August 2026); adults 16+ in England, 192,244 asked the volunteering questions. Landing page: <https://www.gov.uk/government/statistics/community-and-engagement-survey-202526-volunteering> | `community_and_engagement_2025_26_volunteering_and_charitable_giving_data_tables.ods`, <https://assets.publishing.service.gov.uk/media/6a705531862aaf18d9c62b2c/community_and_engagement_2025_26_volunteering_and_charitable_giving_data_tables.ods> (server `Last-Modified` 2026-08-03) | OGL v3.0 | 669,601 bytes | `965c6bfb6fef1c692b333c6a8def36a3fd53d1cd8a243d29cb3a5e990735c6ba` | `derive/ces.py` |

The ONS server sends no `Last-Modified` or `Content-Length`; the sizes above are of the downloaded files.

## Rejected

### US

Candidates read in the two US codebooks, and why each was left out:

| Candidate | Reason |
|---|---|
| SHED `CG4`, regularly provides unpaid care for an adult | Answered by a 4.0 field (`unpaid_care_hours_per_week`), so it would test the profile, not the model. |
| SHED `EF3`, how a 400 dollar emergency expense would be paid | It is 4.0's `could_cover_an_unexpected_expense` (US values name the 400 dollar expense). |
| SHED `EF7`, largest emergency expense that savings could cover | Close to derivable from `could_cover_an_unexpected_expense`, which is a step on the same scale. |
| SHED `C4A`, how often a credit card balance is carried | Asked only of card holders, and close to `unsecured_debt_excluding_student_loans`, a 4.0 field. |
| SHED `B2`, how well you are managing financially | It is 4.0's `managing_financially`. |
| SHED `B7_b`, rating of national economic conditions | Driven mostly by party in 2024; the answer would mostly follow `party_identification`, not the life fields this set is meant to test. |
| NHIS general health, functioning and disability items, health insurance | Each is a 4.0 field or the source of one (`general_health`, `day_to_day_activities_limited_by_health`, `health_insurance`). |
| NHIS household income | Not a candidate study but a missing group: the public file has income only as a ratio to the poverty threshold, which falls on no 4.0 income band, so NHIS studies have insurance groups instead of income groups. |

Held back but computed (reserve studies) are listed in `README.md` under each source.

### UK

Sources and questions read on 2026-11-11 and left out. Tables were downloaded to the scratch folder to check them; nothing below was used.

| Source or candidate | Reason |
|---|---|
| FCA, *Financial Lives 2024* tables (fieldwork 5 February to 16 June 2024, 17,950 adults 18+, random probability sample; <https://www.fca.org.uk/publication/financial-lives/>). Candidates: buy now pay later in the last 12 months (20%), cash use, crypto holding. | Licence. The tables are FCA copyright, not OGL: the FCA's legal page allows personal use or use within one's own organisation, and other reuse needs permission, so publishing derived targets is not clearly allowed. It is the one UK source whose household income bands fall on 4.0's (under 15k, 50k to 70k, 70k to 100k, 100k+, and 15k to 50k as a union). Worth asking the FCA. |
| Ofcom *Technology Tracker 2026* (fieldwork 6 March to 30 June 2026, 4,033 adults 16+), for example landline at home (net 35%) | Not a probability sample: face-to-face quota sampling within random sampling points. Its income bands (10.4k, 15.6k, 26k) do not map. Its ABC1/C2DE breaks would have been the only UK `social_grade` groups. |
| Ofcom *Technology Tracker 2025*; *Adults' Media Literacy* 2024 and 2025; *Online Nation* and online panel polls | Quota or online-panel designs (not probability). Most of their topics (internet use, online activities, devices, social media) are 4.0 fields. |
| DCMS *Community Life Survey 2024/25* and *Participation Survey 2024/25* tables (formal volunteering 28.4%; library visit in person 26.2%) | Superseded by the Community and Engagement Survey 2025/26, which is used for volunteering. The library visit is a composite of three items, and the Participation Survey's youngest band is 16 to 19. |
| ONS, could afford an unexpected but necessary expense of 850 pounds (household finances, table 2) | It is 4.0's `could_cover_an_unexpected_expense`. |
| ONS, health in general (well-being, table 12) | It is 4.0's `general_health`. |
| ONS life satisfaction, worthwhile, happiness, anxiety (well-being, tables 1 to 10) | 0 to 10 scales published as means and thresholds, not as answer shares. |
| ONS, afford energy bills (household finances, table 11) | Asked of people who pay energy bills, which no 4.0 field marks; DESNZ asks everyone about energy bill worry. |
| ONS, using less fuel at home because of the cost of living (one item of a multi-answer list) | One item of a list, and a third energy study next to warmth and bill worry. |
| ONS, important issues facing the UK (binary items) | Binary items from a multi-answer list; which issues people name follows party more than the profile, as for SHED `B7_b`. |
| ONS ran out of food (5%) and unable to pay a bill (6%) | Qualify; held back as rare and overlapping the FSA food-worry study (computed in `derive/aggregates/ons_opn.json`). |
| FSA Wave 11 food security score (USDA scale, table 231) | A score derived from ten items, not one question; its first item is used instead. |
| FSA Wave 11 use-by checks (table 28), Wave 9 concern about food affordability (table 223) | Asked of online respondents only, a base defined by mode, not by profile. |
| FSA Wave 11 vitamin supplements (table 45) | Asked in Northern Ireland online only. |
| FSA Wave 11 hygiene rating checked (table 72), wash raw chicken (table 147) | The first qualifies (67% at 16 to 24, 29% at 75 and over) and is held in reserve to keep the FSA at two studies; the second is asked only of people who cook, which is not a field. |
| FSA income groups (all waves) | Band edges at 19k, 32k, 64k and 96k pounds fall on no 4.0 band edge. |
| DESNZ Winter 2025 climate concern and heat pump knowledge; owner-only and household questions (solar panels, heat pump installation, smart meters, EPC) | Climate concern is taken from Spring 2026 instead (the later wave). Self-rated knowledge of heat pumps qualifies and is held in reserve: awareness of one technology seemed less tied to the profile than the studies kept. The others are asked of owner-occupiers or of households, or have 7 options. |
| Gambling Commission, *Gambling Survey for Great Britain* | Could not be opened: the site's TLS certificate failed to verify. Promising (push-to-web probability sample of adults 18+); worth a manual look. |

### Open respondent-level files found, not used

| File | Why not used |
|---|---|
| FSA Food and You 2 Wave 11 abridged data, `2407752501FoodandYou2Wave11AbridgedDataThreeCountriesV1.csv` (5,811,375 bytes, <https://fsaopendata.blob.core.windows.net/opendatacatalog/>) | Open, but bands income and age as the tables do, and has no tenure or long-term condition variable. It would add only work status and number of children to the two FSA studies, so the tables were used. A possible later addition (on the home server). |
| FSA Wave 9 abridged data (12,366,325 bytes) | Older wave. |
| Ofcom Technology Tracker 2025 and 2026, Adults' Media Literacy 2024 and 2025 respondent files | The surveys are not probability samples. |

### What the UK Data Service would add (registration needed; not used)

The respondent files behind the ONS Opinions and Lifestyle Survey, Food and You 2, the DESNZ Public Attitudes Tracker and the DCMS surveys are
held by the UK Data Service under its End User or Special Licences, which need an account and acceptance of terms. With them the UK studies
could have what the US ones have: groups recoded from the respondent data to 4.0's exact values (finer age bands from 18 rather than 16, 4.0's
household income bands where income is collected, household type, number of own children, tenure detail, health limitation from the questions
themselves); groups for any question rather than only those tabulated; exact rather than rounded n (ONS rounds to 10); and households and
communal establishments separated as the universes need. FSA's finer income bands are Special Licence only and still do not fall on 4.0's
edges. The Participation Survey 2024/25 is reported as open access at the UK Data Service (SN 9460); this was not confirmed and not used.
