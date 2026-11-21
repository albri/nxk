"""nxk benchmark v4, UK: real answers, overall and by persona group, from the DESNZ Public Attitudes Tracker published crosstabulations.

usage: python3 -I -B desnz.py RAW OUT

The crosstabulations are aggregates (published by the Department for Energy Security and Net Zero under the Open Government Licence), so this runs
on the Mac. Downloads the workbook into RAW, checks its pinned sha256, reads it in memory and writes OUT/desnz.json in the same shape as the other
derive scripts.

Public Attitudes Tracker, Spring 2026 wave: adults 16 and over in the UK, addresses sampled at random from the Postcode Address File, push-to-web
with a postal option (an official probability survey). Each sheet gives, per subgroup column, the unweighted base, the weighted base and the
weighted share of each answer (0 to 1). The real distribution here is the weighted shares of the kept options renormalised to 100, to one
decimal; "low" (under 0.5% of the sample) is read as 0.25%, "NA" (nobody) as 0, and a subgroup with any other symbol in a kept option is dropped.
n is the unweighted base.

Groups, in PersonaGen 4.0 UK fields: sex; age band (the tables' own; 16 to 24 is matched to personas aged 18 to 24); highest qualification
(degree level or above = a bachelor's, master's or doctorate; no qualifications). The tables carry no income, tenure, work or health breakdowns.
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
FILE = dict(file="crosstabs_spring2026.xlsx", sha="6d80f0f8bddb59421e7e2d3a106904c275ea1506fb07a9207eaf0b62bf2a788e", url="https://assets.publishing.service.gov.uk/media/6a4268213413112faed80dea/DESNZ_Public_Attitudes_Tracker_-_Crosstabulations__Spring_2026__UK.xlsx")

STUDIES = {
    "desnz-worry-paying-energy-bills": dict(sheet="PAYBILLEN", options=[["Very worried"], ["Fairly worried"], ["Not very worried"], ["Not at all worried"],
                                                                       ["Not applicable/Don't know"]], excluded=["Prefer not to say"]),
    "desnz-concern-about-climate-change": dict(sheet="CLIMCONCERN", options=[["Very concerned"], ["Fairly concerned"], ["Not very concerned"],
                                                                            ["Not at all concerned"]], excluded=["Don't know"]),
}

BREAKDOWNS = {
    "Gender: Female": ("sex", "female", {"field": "sex_at_birth", "in": ["female"]}),
    "Gender: Male": ("sex", "male", {"field": "sex_at_birth", "in": ["male"]}),
    "Age: 16 to 24": ("age", "16_24", {"field": "age_years", "min": 18, "max": 24}),
    "Age: 25 to 34": ("age", "25_34", {"field": "age_years", "min": 25, "max": 34}),
    "Age: 35 to 44": ("age", "35_44", {"field": "age_years", "min": 35, "max": 44}),
    "Age: 45 to 54": ("age", "45_54", {"field": "age_years", "min": 45, "max": 54}),
    "Age: 55 to 64": ("age", "55_64", {"field": "age_years", "min": 55, "max": 64}),
    "Age: 65+": ("age", "65_plus", {"field": "age_years", "min": 65, "max": 100}),
    "Highest Qualification: Degree level or above": ("education", "degree", {"field": "higher_education_qualification", "in": [
        "bachelors_degree_or_equivalent", "masters_degree_or_postgraduate_diploma", "doctorate"]}),
    "Highest Qualification: No qualifications": ("education", "none", {"field": "highest_qualification", "in": ["no_qualifications"]}),
}
SUBSTITUTE = {"low": 0.0025, "NA": 0.0}


def shares(weights, k):
    total = sum(weights)
    raw = [1000 * w / total for w in weights]
    floor = [int(x) for x in raw]
    for i in sorted(range(k), key=lambda i: raw[i] - floor[i], reverse=True)[: 1000 - sum(floor)]:
        floor[i] += 1
    return [f / 10 for f in floor]


def norm(label):
    return " ".join(str(label).replace("\n", " ").split()).replace("’", "'")


def read_table(grid):
    head = next(i for i, r in enumerate(grid) if r and str(r[0]).startswith("Subgroup identifier"))
    columns = [norm(c) if c else None for c in grid[head]]
    rows = {norm(r[0]): r for r in grid[head + 1:] if r and r[0] is not None}
    notes = [str(r[0]) for r in grid[:head] if r and r[0]]
    return {"title": notes[0], "question": notes[1], "base": next((n for n in notes if n.startswith("Base")), "")}, columns, rows


def column_values(rows, options, j):
    values, substituted = [], 0
    for parts in options:
        total = 0.0
        for p in parts:
            v = rows[p][j]
            if isinstance(v, float):
                total += v
            elif v in SUBSTITUTE:
                total += SUBSTITUTE[v]
                substituted += 1
            else:
                return None, substituted
        values.append(total)
    return (values if sum(values) > 0 else None), substituted


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
        meta, columns, rows = read_table(book.grid(s["sheet"]))
        missing = [p for parts in s["options"] for p in parts if p not in rows] + [p for p in s["excluded"] if p not in rows]
        if missing:
            raise SystemExit(f"{sid}: rows {missing} not in {s['sheet']}")
        k = len(s["options"])
        total_j = columns.index("Total")
        values, substituted = column_values(rows, s["options"], total_j)
        groups, dropped = {}, {}
        for label, (dim, g, rule) in BREAKDOWNS.items():
            definitions.setdefault(dim, {})[g] = rule
            if label not in columns:
                dropped[f"{dim}:{g}"] = "not in table"
                continue
            j = columns.index(label)
            n = rows["Unweighted Base"][j]
            gv, gsub = column_values(rows, s["options"], j)
            if gv is None or not isinstance(n, float) or n < MIN_N:
                dropped[f"{dim}:{g}"] = n
                continue
            substituted += gsub
            groups.setdefault(dim, {})[g] = {"real": shares(gv, k), "n": int(n)}
        studies[sid] = {"real": shares(values, k), "n": int(rows["Unweighted Base"][total_j]), "groups": groups, "groups_dropped_for_n": dropped,
                        "cells_substituted": substituted,
                        "table": dict(meta, workbook=FILE["file"], sheet=s["sheet"],
                                      published_total={name: r[total_j] for name, r in rows.items() if name not in ("Unweighted Base", "Weighted Base")})}
    result = {"source": {"name": "DESNZ Public Attitudes Tracker, Spring 2026 crosstabulations", "file": FILE, "min_group_n": MIN_N},
              "group_definitions": definitions, "studies": studies}
    with open(os.path.join(out, "desnz.json"), "w") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    print(json.dumps({sid: [r["real"], r["n"], sorted(r["groups"]), r["groups_dropped_for_n"], r["cells_substituted"]] for sid, r in studies.items()}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
