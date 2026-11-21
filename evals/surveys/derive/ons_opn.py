"""nxk benchmark v4, UK: real answers, overall and by persona group, from the ONS Opinions and Lifestyle Survey (OPN) published tables.

usage: python3 -I -B ons_opn.py RAW OUT

The tables are aggregates (published by ONS under the Open Government Licence), so this runs on the Mac. Downloads each workbook into RAW, checks
its pinned sha256, reads it in memory and writes OUT/ons_opn.json in the same shape as the US derive scripts: for every study the distribution
over the kept options and the unweighted n, overall and for every group with at least 100 respondents, plus the table cells read.

What ONS publishes and how it is used:
- Estimates are weighted percentages rounded to whole numbers; sample sizes are respondents to the question in each breakdown, rounded to the
  nearest 10 (they include the people who said don't know or preferred not to say). The real distribution here is the published estimates of the
  kept options, renormalised to 100 (so "don't know" and "prefer not to say" leave the base, as in the US scripts), to one decimal.
- "[low]" (under 1 but not zero) and "[c]" (fewer than 3 respondents) are read as 0.5, "[w]" (nobody) as 0; a breakdown with "[u]" (10 or fewer
  respondents) or any other symbol in a kept option is dropped. Each substitution is counted in the output.
- The survey samples people 16 and over in Great Britain. The youngest ONS age band is 16 to 29; it is matched to personas aged 18 to 29.

Groups, in PersonaGen 4.0 UK fields: age band; sex; disability (Equality Act core definition: a condition lasting 12 months or more that reduces
day-to-day activities = limited a lot or a little); employment status; tenure (outright, mortgage, social renters, private renters); highest
qualification (degree or equivalent, ONS note 8, = a bachelor's, master's or doctorate; none); parent of a dependent child in the household (ONS
note 9, the same definition as 4.0's dependent child). ONS publishes no income breakdown for these tables.
"""
import hashlib
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("xlsx", os.path.join(HERE, "xlsx.py"))
xlsx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(xlsx)

MIN_N = 100
FILES = {
    "household_finances": dict(
        file="hf_pc_jul_sep2026.xlsx", sha="e6aeccc5b66cdfc29b7ef3eb28d05fb9ebdbdb66e607e53f7920c35fe9d626ca",
        url="https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/personalandhouseholdfinances/debt/datasets/publicopinionsandsocialtrendsgreatbritainhouseholdfinancesbypersonalcharacteristics/1julyto27september2026/householdfinancesbypersonalcharacteristics1julyto27september2026.xlsx"),
    "wellbeing": dict(
        file="wl_pc_jul_sep2026.xlsx", sha="b9997dc354f8f7c7429a0d798b78bd45136d6c92f06ea7bec5cf197550ed563a",
        url="https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/healthandsocialcare/healthandwellbeing/datasets/publicopinionsandsocialtrendsgreatbritainpersonalwellbeingandlonelinessbypersonalcharacteristics/1julyto27september2026/personalwellbeingandlonelinessbypersonalcharacteristics1julyto27september2026.xlsx"),
    "winter_pressures": dict(
        file="wp_pc_oct25_jan26.xlsx", sha="193a986ec4d8f5026d0082bf82960711efc93f6bfa5464df52d11c0207a7213a",
        url="https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/personalandhouseholdfinances/debt/datasets/publicopinionsandsocialtrendsgreatbritainwinterpressuresbypersonalcharacteristics/1october2025to4january2026/winterpressuresbypersonalcharacteristics1october2025to4january2026.xlsx"),
}

# Each study: workbook, sheet, the published response options that make each kept option (several are summed), and the ones excluded.
STUDIES = {
    "ons-loneliness-frequency": dict(book="wellbeing", sheet="Table_11",
                                     options=[["Often or always"], ["Some of the time"], ["Occasionally"], ["Hardly ever"], ["Never"]],
                                     excluded=["Don't know", "Prefer not to say"]),
    "ons-able-to-save-next-12-months": dict(book="household_finances", sheet="Table_1", options=[["Yes"], ["No"], ["Don't know"]],
                                            excluded=["Prefer not to say"]),
    "ons-borrowed-more-than-usual": dict(book="household_finances", sheet="Table_3", options=[["Yes"], ["No"]],
                                         excluded=["Don't know", "Prefer not to say"]),
    "ons-afford-rent-or-mortgage": dict(book="household_finances", sheet="Table_10",
                                        options=[["Very easy"], ["Somewhat easy"], ["Somewhat difficult"], ["Very difficult"]],
                                        excluded=["Don't know", "Prefer not to say"]),
    "ons-ran-out-of-food": dict(book="household_finances", sheet="Table_8", options=[["Yes"], ["No"]], excluded=["Don't know", "Prefer not to say"]),
    "ons-unable-to-pay-a-bill": dict(book="household_finances", sheet="Table_7", options=[["Yes"], ["No"]], excluded=["Don't know", "Prefer not to say"]),
    "ons-kept-comfortably-warm": dict(book="winter_pressures", sheet="Table_2",
                                      options=[["Often or always"], ["Some of the time"], ["Occasionally"], ["Hardly ever", "Never"]],
                                      excluded=["Don't know", "Prefer not to say"]),
}

DISABLED = ["limited_a_lot", "limited_a_little"]
NOT_DISABLED = ["has_a_long_term_condition_not_limiting", "no_long_term_condition"]
# (ONS breakdown category, breakdown) -> (dimension, group, rule)
BREAKDOWNS = {
    ("Age bands", "16 to 29"): ("age", "16_29", {"field": "age_years", "min": 18, "max": 29}),
    ("Age bands", "30 to 49"): ("age", "30_49", {"field": "age_years", "min": 30, "max": 49}),
    ("Age bands", "50 to 69"): ("age", "50_69", {"field": "age_years", "min": 50, "max": 69}),
    ("Age bands", "70 and over"): ("age", "70_plus", {"field": "age_years", "min": 70, "max": 100}),
    ("Sex", "Female"): ("sex", "female", {"field": "sex_at_birth", "in": ["female"]}),
    ("Sex", "Male"): ("sex", "male", {"field": "sex_at_birth", "in": ["male"]}),
    ("Disability status", "Disabled"): ("health_limitation", "disabled", {"field": "day_to_day_activities_limited_by_health", "in": DISABLED}),
    ("Disability status", "Non-disabled"): ("health_limitation", "not_disabled", {"field": "day_to_day_activities_limited_by_health", "in": NOT_DISABLED}),
    ("Employment status", "Employed or self-employed incl unpaid family worker"): ("work", "in_employment",
                                                                                    {"field": "economic_activity_status", "in": ["in_employment"]}),
    ("Employment status", "Unemployed"): ("work", "unemployed", {"field": "economic_activity_status", "in": ["unemployed_and_looking_for_work"]}),
    ("Employment status", "Economically inactive - retired"): ("work", "retired", {"field": "economic_activity_status", "in": ["retired"]}),
    ("Employment status", "Economically inactive - other"): ("work", "inactive_other", {"field": "economic_activity_status", "in": [
        "student_not_in_employment", "looking_after_home_or_family", "long_term_sick_or_disabled", "other_not_working"]}),
    ("Tenure group", "Own it outright"): ("tenure", "outright", {"field": "home_tenure", "in": ["owned_outright"]}),
    ("Tenure group", "Currently paying off a mortgage or loan used to buy the property"): ("tenure", "mortgage",
                                                                                          {"field": "home_tenure", "in": ["owned_with_a_mortgage_or_loan"]}),
    ("Tenure group", "Pay rent to the council, housing association, or charitable trust"): ("tenure", "social_rent", {"field": "home_tenure", "in": [
        "rented_from_a_council_or_local_authority", "rented_from_a_housing_association_or_other_social_landlord"]}),
    ("Tenure group", "Pay rent to a private landlord"): ("tenure", "private_rent", {"field": "home_tenure", "in": ["rented_from_a_private_landlord_or_letting_agency"]}),
    ("Highest qualification", "Degree or equivalent"): ("education", "degree", {"field": "higher_education_qualification", "in": [
        "bachelors_degree_or_equivalent", "masters_degree_or_postgraduate_diploma", "doctorate"]}),
    ("Highest qualification", "None"): ("education", "none", {"field": "highest_qualification", "in": ["no_qualifications"]}),
    ("Parental status", "Parent of a dependent child"): ("children", "one_or_more", {"field": "own_dependent_children_at_home",
                                                                                     "in": ["1", "2", "3", "4", "5", "6_or_more"]}),
    ("Parental status", "Not a parent of a dependent child"): ("children", "none", {"field": "own_dependent_children_at_home", "in": ["0"]}),
}
SUBSTITUTE = {"[low]": 0.5, "[c]": 0.5, "[w]": 0.0}


def shares(weights, k):
    total = sum(weights)
    raw = [1000 * w / total for w in weights]
    floor = [int(x) for x in raw]
    for i in sorted(range(k), key=lambda i: raw[i] - floor[i], reverse=True)[: 1000 - sum(floor)]:
        floor[i] += 1
    return [f / 10 for f in floor]


def read_table(grid):
    """{(category, breakdown): {"cells": {response: estimate}, "n": sample size}} and the question line above the header."""
    head = next(i for i, r in enumerate(grid) if r and r[0] == "Breakdown category")
    cols = {name: j for j, name in enumerate(grid[head]) if name}
    question = next((r[0] for r in grid[:head] if r[0] and str(r[0]).startswith("Question:")), "")
    base = next((r[0] for r in grid[:head] if r[0] and str(r[0]).startswith("Among")), "All persons")
    out = {}
    for r in grid[head + 1:]:
        if not r or r[0] is None:
            continue
        key = (str(r[0]).strip(), str(r[1]).strip())
        cell = out.setdefault(key, {"cells": {}, "n": None})
        cell["cells"][str(r[cols["Response options"]]).strip()] = r[cols["Estimate (%)"]]
        n = r[cols["Sample size"]]
        if isinstance(n, float):
            cell["n"] = int(n)
    return question, base, out


def distribution(cells, options):
    values, substituted = [], 0
    for parts in options:
        total = 0.0
        for p in parts:
            v = cells.get(p)
            if isinstance(v, float):
                total += v
            elif v in SUBSTITUTE:
                total += SUBSTITUTE[v]
                substituted += 1
            else:
                return None, substituted
        values.append(total)
    if sum(values) <= 0:
        return None, substituted
    return values, substituted


def main(raw, out):
    os.makedirs(raw, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    books = {}
    for key, f in FILES.items():
        path = os.path.join(raw, f["file"])
        if not os.path.exists(path):
            subprocess.run(["curl", "-sSL", "--fail", "-m", "300", "-o", path, f["url"]], check=True)
        blob = open(path, "rb").read()
        if hashlib.sha256(blob).hexdigest() != f["sha"]:
            raise SystemExit(f"{f['file']}: sha256 differs from the pinned one")
        books[key] = xlsx.Book(blob)
    definitions, studies = {}, {}
    for sid, s in STUDIES.items():
        question, base, table = read_table(books[s["book"]].grid(s["sheet"]))
        k = len(s["options"])
        allc = table[("All persons", "All")]
        vals, sub = distribution(allc["cells"], s["options"])
        groups, dropped, substituted = {}, {}, sub
        for key, (dim, g, rule) in BREAKDOWNS.items():
            definitions.setdefault(dim, {})[g] = rule
            if key not in table:
                dropped[f"{dim}:{g}"] = "not in table"
                continue
            cell = table[key]
            gv, gsub = distribution(cell["cells"], s["options"])
            if gv is None or cell["n"] is None or cell["n"] < MIN_N:
                dropped[f"{dim}:{g}"] = cell["n"]
                continue
            substituted += gsub
            groups.setdefault(dim, {})[g] = {"real": shares(gv, k), "n": cell["n"]}
        studies[sid] = {"real": shares(vals, k), "n": allc["n"], "groups": groups, "groups_dropped_for_n": dropped, "cells_substituted": substituted,
                        "table": {"workbook": FILES[s["book"]]["file"], "sheet": s["sheet"], "question": question, "base": base,
                                  "published_all_persons": allc["cells"]}}
    result = {"source": {"name": "ONS Opinions and Lifestyle Survey, Public opinions and social trends tables", "files": FILES, "min_group_n": MIN_N},
              "group_definitions": definitions, "studies": studies}
    with open(os.path.join(out, "ons_opn.json"), "w") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    print(json.dumps({sid: [r["real"], r["n"], sorted(r["groups"]), r["cells_substituted"]] for sid, r in studies.items()}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
