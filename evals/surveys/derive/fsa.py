"""nxk benchmark v4, UK: real answers, overall and by persona group, from the FSA's Food and You 2 Wave 11 published tables.

usage: python3 -I -B fsa.py RAW OUT

The tables are aggregates (published by the Food Standards Agency under the Open Government Licence), so this runs on the Mac. Downloads the
all-country workbook into RAW, checks its pinned sha256, reads it in memory and writes OUT/fsa.json in the same shape as the other derive scripts.

Food and You 2 Wave 11: fieldwork 9 May to 7 August 2025, adults 16 and over in England, Wales and Northern Ireland, households drawn from the
Postcode Address File, push-to-web with a postal questionnaire (an official probability survey). Each table gives, per breakdown, the unweighted
number answering ("Unweighted total"), the weighted total and the weighted percentage of each answer. The real distribution here is the weighted
percentages of the kept options renormalised to 100 (answers such as "prefer not to say" leave the base), to one decimal; n is the unweighted total.

Groups, in PersonaGen 4.0 UK fields: sex; age band (the tables' own; 16 to 24 is matched to personas aged 18 to 24); household size; long-term
health condition (question LTCOND, a physical or mental condition lasting 12 months or more: 4.0's day_to_day_activities_limited_by_health
other than no_long_term_condition). The tables' household income bands (under 19,000, 19,000 to 31,999, 32,000 to 63,999, 64,000 to 95,999,
96,000 pounds or more) do not fall on 4.0's band edges, so there are no income groups.
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
FILE = dict(file="W11_allCountry_pub_251217.xlsx", sha="22867c92a4fedb417e9f0432382a3d77b3de60dc10691a29f9efbeada723e536", url="https://fsaopendata.blob.core.windows.net/opendatacatalog/W11_allCountry_pub_251217.xlsx")

STUDIES = {
    "fsa-worried-food-would-run-out": dict(sheet="T217", options=[["Often true (%)"], ["Sometimes true (%)"], ["Never true (%)"]],
                                           excluded=["Don't know or prefer not to say (%)"]),
    "fsa-food-bank-12-months": dict(sheet="T227", options=[["Yes (%)"], ["No (%)"]], excluded=["Prefer not to say (%)"]),
    "fsa-checks-animal-welfare-info": dict(sheet="T236", options=[["Always (%)"], ["Most of the time (%)"], ["About half the time (%)"], ["Occasionally (%)"],
                                                                  ["Never (%)"]], excluded=["Don't know (%)"]),
}

WITH_CONDITION = ["limited_a_lot", "limited_a_little", "has_a_long_term_condition_not_limiting"]
BREAKDOWNS = {
    ("Gender", "Female"): ("sex", "female", {"field": "sex_at_birth", "in": ["female"]}),
    ("Gender", "Male"): ("sex", "male", {"field": "sex_at_birth", "in": ["male"]}),
    ("Age Group", "16-24"): ("age", "16_24", {"field": "age_years", "min": 18, "max": 24}),
    ("Age Group", "25-34"): ("age", "25_34", {"field": "age_years", "min": 25, "max": 34}),
    ("Age Group", "35-44"): ("age", "35_44", {"field": "age_years", "min": 35, "max": 44}),
    ("Age Group", "45-54"): ("age", "45_54", {"field": "age_years", "min": 45, "max": 54}),
    ("Age Group", "55-64"): ("age", "55_64", {"field": "age_years", "min": 55, "max": 64}),
    ("Age Group", "65-74"): ("age", "65_74", {"field": "age_years", "min": 65, "max": 74}),
    ("Age Group", "75+"): ("age", "75_plus", {"field": "age_years", "min": 75, "max": 100}),
    ("Household Size", "1"): ("household_size", "1", {"field": "people_in_household", "in": ["1"]}),
    ("Household Size", "2"): ("household_size", "2", {"field": "people_in_household", "in": ["2"]}),
    ("Household Size", "3"): ("household_size", "3", {"field": "people_in_household", "in": ["3"]}),
    ("Household Size", "4"): ("household_size", "4", {"field": "people_in_household", "in": ["4"]}),
    ("Household Size", "5+"): ("household_size", "5_plus", {"field": "people_in_household", "in": ["5", "6", "7", "8_or_more"]}),
    ("Long Term Health Condition", "Has a long term health condition"): ("long_term_condition", "yes",
                                                                         {"field": "day_to_day_activities_limited_by_health", "in": WITH_CONDITION}),
    ("Long Term Health Condition", "Doesn't have a long term health condition"): ("long_term_condition", "no",
                                                                                  {"field": "day_to_day_activities_limited_by_health", "in": ["no_long_term_condition"]}),
}


def shares(weights, k):
    total = sum(weights)
    raw = [1000 * w / total for w in weights]
    floor = [int(x) for x in raw]
    for i in sorted(range(k), key=lambda i: raw[i] - floor[i], reverse=True)[: 1000 - sum(floor)]:
        floor[i] += 1
    return [f / 10 for f in floor]


def read_table(grid):
    head = next(i for i, r in enumerate(grid) if r and r[0] == "Group")
    cols = {str(name).strip(): j for j, name in enumerate(grid[head]) if name}
    rows = {}
    for r in grid[head + 1:]:
        if not r or r[0] is None:
            continue
        key = (str(r[1]).strip(), str(r[0]).strip())
        rows[key] = {"n": int(r[cols["Unweighted total"]]), "cells": {name: r[j] for name, j in cols.items()}}
    return {"question": str(grid[0][0]).strip(), "base": str(grid[1][0]).strip()}, cols, rows


def distribution(cells, options):
    values = []
    for parts in options:
        total = 0.0
        for p in parts:
            v = cells.get(p)
            if not isinstance(v, float):
                return None
            total += v
        values.append(total)
    return values if sum(values) > 0 else None


def main(raw, out):
    os.makedirs(raw, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    path = os.path.join(raw, FILE["file"])
    if not os.path.exists(path):
        subprocess.run(["curl", "-sSL", "--fail", "-m", "300", "-o", path, FILE["url"]], check=True)
    blob = open(path, "rb").read()
    if hashlib.sha256(blob).hexdigest() != FILE["sha"]:
        raise SystemExit(f"{FILE['file']}: sha256 differs from the pinned one")
    book = xlsx.Book(blob)
    definitions, studies = {}, {}
    for sid, s in STUDIES.items():
        meta, cols, rows = read_table(book.grid(s["sheet"]))
        missing = [p for parts in s["options"] for p in parts if p not in cols] + [p for p in s["excluded"] if p not in cols]
        if missing:
            raise SystemExit(f"{sid}: columns {missing} not in {s['sheet']}")
        k = len(s["options"])
        total = rows[("Total", "Total")]
        groups, dropped = {}, {}
        for key, (dim, g, rule) in BREAKDOWNS.items():
            definitions.setdefault(dim, {})[g] = rule
            row = rows.get(key)
            gv = distribution(row["cells"], s["options"]) if row else None
            if gv is None or row["n"] < MIN_N:
                dropped[f"{dim}:{g}"] = row["n"] if row else "not in table"
                continue
            groups.setdefault(dim, {})[g] = {"real": shares(gv, k), "n": row["n"]}
        studies[sid] = {"real": shares(distribution(total["cells"], s["options"]), k), "n": total["n"], "groups": groups, "groups_dropped_for_n": dropped,
                        "table": dict(meta, workbook=FILE["file"], sheet=s["sheet"],
                                      published_total={c: total["cells"][c] for c in cols if c.endswith("(%)")})}
    result = {"source": {"name": "Food and You 2: Wave 11 (2025), all-country tables", "file": FILE, "min_group_n": MIN_N},
              "group_definitions": definitions, "studies": studies}
    with open(os.path.join(out, "fsa.json"), "w") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    print(json.dumps({sid: [r["real"], r["n"], sorted(r["groups"]), r["groups_dropped_for_n"]] for sid, r in studies.items()}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
