"""nxk benchmark v4, UK: real answers, overall and by persona group, from the DCMS Community and Engagement Survey 2025/26 published tables.

usage: python3 -I -B ces.py RAW OUT

The tables are aggregates (published by the Department for Culture, Media and Sport under the Open Government Licence), so this runs on the Mac.
Downloads the volunteering workbook (.ods) into RAW, checks its pinned sha256, reads it in memory and writes OUT/ces.json in the same shape as the
other derive scripts.

Community and Engagement Survey 2025/26 (it replaced the Community Life Survey and the Participation Survey in October 2025): adults 16 and over in
England, a stratified random sample of addresses from the Postcode Address File, push-to-web with targeted paper questionnaires; fieldwork
15 October 2025 to March 2026. The volunteering tables follow the Community Life Survey's methodology. Table G4 gives, per breakdown, the weighted
percentage who did formal volunteering at least once in the last 12 months, the unweighted count saying yes and the unweighted base (respondents
asked). The real distribution here is that percentage and its complement, to one decimal; n is the unweighted base.

Groups, in PersonaGen 4.0 UK fields: age band (the table's own; 16 to 24 is matched to personas aged 18 to 24); sex; highest qualification (degree
level or above = a bachelor's, master's or doctorate; no qualifications); working or not; tenure (owners = outright or with a mortgage; social
renters; private renters = from a private landlord or letting agency; shared ownership and renting from a relative, friend or employer are left
out of every group because the tables do not say where they sit). Not used: disability (the tables give no definition), children in the household
(any child, not the respondent's own dependent children), religion, ethnicity, region and the area-based breakdowns.
"""
import hashlib
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ods", os.path.join(HERE, "ods.py"))
ods = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ods)

MIN_N = 100
FILE = dict(file="community_and_engagement_2025_26_volunteering_and_charitable_giving_data_tables.ods",
            sha="965c6bfb6fef1c692b333c6a8def36a3fd53d1cd8a243d29cb3a5e990735c6ba",
            url="https://assets.publishing.service.gov.uk/media/6a705531862aaf18d9c62b2c/"
                "community_and_engagement_2025_26_volunteering_and_charitable_giving_data_tables.ods")
YEAR = "2025/26"

STUDIES = {
    "ces-formal-volunteering-12-months": dict(sheet="G4", measure="Formal volunteering at least once in the last 12 months"),
}

NOT_WORKING = ["unemployed_and_looking_for_work", "retired", "student_not_in_employment", "looking_after_home_or_family", "long_term_sick_or_disabled",
               "other_not_working"]
BREAKDOWNS = {
    ("Age", "16 to 24"): ("age", "16_24", {"field": "age_years", "min": 18, "max": 24}),
    ("Age", "25 to 34"): ("age", "25_34", {"field": "age_years", "min": 25, "max": 34}),
    ("Age", "35 to 49"): ("age", "35_49", {"field": "age_years", "min": 35, "max": 49}),
    ("Age", "50 to 64"): ("age", "50_64", {"field": "age_years", "min": 50, "max": 64}),
    ("Age", "65 to 74"): ("age", "65_74", {"field": "age_years", "min": 65, "max": 74}),
    ("Age", "75 and over"): ("age", "75_plus", {"field": "age_years", "min": 75, "max": 100}),
    ("Sex", "Female"): ("sex", "female", {"field": "sex_at_birth", "in": ["female"]}),
    ("Sex", "Male"): ("sex", "male", {"field": "sex_at_birth", "in": ["male"]}),
    ("Highest educational/vocational qualification", "Degree level or above - GROUPED"): ("education", "degree", {
        "field": "higher_education_qualification", "in": ["bachelors_degree_or_equivalent", "masters_degree_or_postgraduate_diploma", "doctorate"]}),
    ("Highest educational/vocational qualification", "No qualifications"): ("education", "none", {"field": "highest_qualification",
                                                                                                  "in": ["no_qualifications"]}),
    ("Employment status", "Working"): ("work", "in_employment", {"field": "economic_activity_status", "in": ["in_employment"]}),
    ("Employment status", "Not working"): ("work", "not_in_work", {"field": "economic_activity_status", "in": NOT_WORKING}),
    ("Tenure type", "Owners"): ("tenure", "owned", {"field": "home_tenure", "in": ["owned_outright", "owned_with_a_mortgage_or_loan"]}),
    ("Tenure type", "Social rented sector"): ("tenure", "social_rent", {"field": "home_tenure", "in": [
        "rented_from_a_council_or_local_authority", "rented_from_a_housing_association_or_other_social_landlord"]}),
    ("Tenure type", "Private rented sector"): ("tenure", "private_rent", {"field": "home_tenure", "in": ["rented_from_a_private_landlord_or_letting_agency"]}),
}


def shares(weights, k):
    total = sum(weights)
    raw = [1000 * w / total for w in weights]
    floor = [int(x) for x in raw]
    for i in sorted(range(k), key=lambda i: raw[i] - floor[i], reverse=True)[: 1000 - sum(floor)]:
        floor[i] += 1
    return [f / 10 for f in floor]


def read_table(grid):
    head = next(i for i, r in enumerate(grid) if r and r[0] == "Question")
    cols = {str(name).strip(): j for j, name in enumerate(grid[head]) if name}
    pct, count, base = (cols[f"Percentage {YEAR} (%)"], cols[f"Number of respondents {YEAR}"],
                        cols[f"Unweighted Base - number of people aged 16 and over {YEAR}"])
    rows = {}
    for r in grid[head + 1:]:
        if not r or r[0] is None:
            continue
        r = r + [None] * (len(grid[head]) - len(r))
        rows[(str(r[0]).strip(), str(r[1]).strip())] = {"pct": r[pct], "count": r[count], "base": r[base]}
    return {"title": str(grid[0][0]).strip()}, rows


def main(raw, out):
    os.makedirs(raw, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    path = os.path.join(raw, FILE["file"])
    if not os.path.exists(path):
        subprocess.run(["curl", "-sSL", "--fail", "-m", "300", "-o", path, FILE["url"]], check=True)
    blob = open(path, "rb").read()
    if hashlib.sha256(blob).hexdigest() != FILE["sha"]:
        raise SystemExit(f"{FILE['file']}: sha256 differs from the pinned one")
    book = ods.Book(blob)
    definitions, studies = {}, {}
    for sid, s in STUDIES.items():
        meta, rows = read_table(book.grid(s["sheet"]))
        total = rows[(s["measure"], "Total (yes)")]
        groups, dropped = {}, {}
        for key, (dim, g, rule) in BREAKDOWNS.items():
            definitions.setdefault(dim, {})[g] = rule
            row = rows.get(key)
            if row is None:
                dropped[f"{dim}:{g}"] = "not in table"
                continue
            if not isinstance(row["pct"], float) or not isinstance(row["base"], float) or row["base"] < MIN_N:
                dropped[f"{dim}:{g}"] = row["base"]
                continue
            groups.setdefault(dim, {})[g] = {"real": shares([row["pct"], 100 - row["pct"]], 2), "n": int(row["base"])}
        studies[sid] = {"real": shares([total["pct"], 100 - total["pct"]], 2), "n": int(total["base"]), "groups": groups,
                        "groups_dropped_for_n": dropped,
                        "table": dict(meta, workbook=FILE["file"], sheet=s["sheet"], year=YEAR, published_total=total)}
    result = {"source": {"name": "Community and Engagement Survey 2025/26, volunteering and charitable giving data tables", "file": FILE,
                         "min_group_n": MIN_N},
              "group_definitions": definitions, "studies": studies}
    with open(os.path.join(out, "ces.json"), "w") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    print(json.dumps({sid: [r["real"], r["n"], {d: {g: v["real"][0] for g, v in gs.items()} for d, gs in r["groups"].items()}, r["groups_dropped_for_n"]]
                      for sid, r in studies.items()}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
