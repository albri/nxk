"""nxk benchmark v4, US health block: real answers, overall and by persona group, from the NHIS 2024 sample adult file.

usage: python3 -I -B nhis.py RAW OUT

Runs on the home server (respondent-level file). Downloads adult24csv.zip into RAW (kept there until the job is deleted), checks the pinned sha256,
reads adult24.csv from the zip in memory and writes OUT/nhis.json: for every study the weighted distribution and the unweighted n, overall and for
every group with at least 100 respondents, plus the unweighted counts of each answer code. No respondent row leaves the server.

Source: National Center for Health Statistics, National Health Interview Survey 2024, sample adult file (public domain), interviews January to
December 2024, civilian non-institutionalised adults 18 and over. Weight: WTFA_A. Codes 7 (refused), 8 (not ascertained) and 9 (don't know) are
excluded from a study's base, as NCHS estimates do.

Groups are defined on PersonaGen 4.0 field names and values, with the profile variables as the PersonaGen real-record control reads them
(evidence/real-control-2026-11-11/nhis/scripts/nhis_sample.py): age AGEP_A, sex SEX_A, education EDUCP_A, home tenure HOUTENURE_A, work status
EMPWRKLSW1_A / EMPNOWRK_A / EMPWHYNOT_A, own children under 18 in the family PARSTAT_A, health limitation DISAB3_A (the NHIS disability indicator
PersonaGen's US `limited_a_lot` is fitted to), health insurance from the coverage recodes. The 2024 public files carry family income only as a ratio
to the poverty threshold, which no profile field holds, so these studies have no income groups.
"""
import collections
import csv
import hashlib
import io
import json
import os
import subprocess
import sys
import zipfile

URL = "https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NHIS/2024/adult24csv.zip"
SHA = "5f926b2ec0af508fa84ebc791c83bfefa6f020724754aab599004706981abdaf"
MEMBER = "adult24.csv"
MIN_N = 100
MISSING = (7, 8, 9)


def code(row, name):
    value = row[name].strip()
    return int(float(value)) if value else None


def coded(name, table, missing=MISSING):
    """Maps an NHIS code to an option index; refused, not ascertained and don't know are excluded."""
    def read(row):
        c = code(row, name)
        if c is None or c in missing:
            return None, "excluded"
        if c in table:
            return table[c], "ok"
        return None, "unmapped"
    return read


YES_NO = {1: 0, 2: 1}


def sleep(row):
    c = code(row, "SLPHOURS_A")
    if c is None or c in (97, 98, 99):
        return None, "excluded"
    if not 1 <= c <= 24:
        return None, "unmapped"
    return (0 if c <= 5 else 1 if c == 6 else 2 if c == 7 else 3 if c == 8 else 4), "ok"


STUDIES = {
    "nhis-flu-vaccine-12-months": dict(columns=["SHTFLU12M_A"], read=coded("SHTFLU12M_A", YES_NO), k=2),
    "nhis-worry-paying-medical-bills": dict(columns=["PAYWORRY_A"], read=coded("PAYWORRY_A", {1: 0, 2: 1, 3: 2}), k=3),
    "nhis-virtual-appointment-12-months": dict(columns=["VIRAPP12M_A"], read=coded("VIRAPP12M_A", YES_NO), k=2),
    "nhis-loneliness-frequency": dict(columns=["LONELY_A"], read=coded("LONELY_A", {1: 0, 2: 1, 3: 2, 4: 3, 5: 4}), k=5),
    "nhis-volunteered-12-months": dict(columns=["CEVOLUN1_A"], read=coded("CEVOLUN1_A", YES_NO), k=2),
    "nhis-e-cigarette-use": dict(columns=["SMKECIGST_A"], read=coded("SMKECIGST_A", {1: 0, 2: 1, 3: 2}, missing=(4, 9)), k=3),
    "nhis-sleep-hours": dict(columns=["SLPHOURS_A"], read=sleep, k=5),
    "nhis-delayed-care-cost": dict(columns=["MEDDL12M_A"], read=coded("MEDDL12M_A", YES_NO), k=2),
}

GROUPS = {
    "age": {"18_29": {"field": "age_years", "min": 18, "max": 29}, "30_44": {"field": "age_years", "min": 30, "max": 44},
            "45_64": {"field": "age_years", "min": 45, "max": 64}, "65_plus": {"field": "age_years", "min": 65, "max": 100}},
    "sex": {"female": {"field": "sex_at_birth", "in": ["female"]}, "male": {"field": "sex_at_birth", "in": ["male"]}},
    "tenure": {"owned": {"field": "home_tenure", "in": ["owned_with_a_mortgage_or_loan", "owned_free_and_clear"]},
               "rented": {"field": "home_tenure", "in": ["rented_without_government_housing_assistance", "rented_with_government_housing_assistance"]}},
    "education": {"hs_or_less": {"field": "highest_qualification", "in": ["less_than_high_school_diploma", "high_school_diploma_or_ged"]},
                  "some_college": {"field": "highest_qualification", "in": ["some_college_no_degree", "associate_degree"]},
                  "degree": {"field": "highest_qualification", "in": ["bachelors_degree", "masters_degree", "professional_degree_beyond_a_bachelors", "doctorate_degree"]}},
    "work": {"in_employment": {"field": "economic_activity_status", "in": ["in_employment"]},
             "retired": {"field": "economic_activity_status", "in": ["retired"]},
             "not_working": {"field": "economic_activity_status", "in": ["unemployed_and_looking_for_work", "student_not_in_employment", "looking_after_home_or_family",
                                                                         "long_term_sick_or_disabled", "other_not_working"]}},
    "children": {"none": {"field": "own_dependent_children_at_home", "in": ["0"]},
                 "one_or_more": {"field": "own_dependent_children_at_home", "in": ["1", "2", "3", "4", "5", "6_or_more"]}},
    "health_limitation": {"limited_a_lot": {"field": "day_to_day_activities_limited_by_health", "in": ["limited_a_lot"]},
                          "not_limited_a_lot": {"field": "day_to_day_activities_limited_by_health",
                                                "in": ["limited_a_little", "has_a_long_term_condition_not_limiting", "no_long_term_condition"]}},
    "insurance": {"uninsured": {"field": "health_insurance", "in": ["no_health_insurance"]},
                  "private_only": {"field": "health_insurance", "in": ["employer_only", "direct_purchase_only", "multiple_private_types"]},
                  "medicaid_or_public_only": {"field": "health_insurance", "in": ["medicaid_or_other_public_only"]},
                  "medicare": {"field": "health_insurance", "in": ["medicare_only", "employer_and_medicare", "direct_purchase_and_medicare", "medicare_and_medicaid"]}},
}
EDUCATION = {0: "hs_or_less", 1: "hs_or_less", 2: "hs_or_less", 3: "hs_or_less", 4: "hs_or_less", 5: "some_college", 6: "some_college", 7: "some_college",
             8: "degree", 9: "degree", 10: "degree"}


def insurance(row):
    """As nhis_sample.py's insurance(): the coverage recodes to the profile's classes, then to the four groups (None for military and other mixes)."""
    notcov = code(row, "NOTCOV_A")
    if notcov == 1:
        return "uninsured"
    if notcov != 2:
        return None
    have = lambda name: code(row, name) in (1, 2)
    private, medicare = have("PRIVATE_A"), have("MEDICARE_A")
    public = have("MEDICAID_A") or have("CHIP_A") or have("OTHPUB_A") or have("OTHGOV_A")
    military = have("MILITARY_A")
    held = (private, medicare, public, military)
    return {(True, False, False, False): "private_only", (False, False, True, False): "medicaid_or_public_only", (False, True, False, False): "medicare",
            (True, True, False, False): "medicare", (False, True, True, False): "medicare"}.get(held)


def groups_of(row):
    out = {}
    age = code(row, "AGEP_A")
    out["age"] = None if age is None or age > 85 else "18_29" if age < 30 else "30_44" if age < 45 else "45_64" if age < 65 else "65_plus"
    out["sex"] = {1: "male", 2: "female"}.get(code(row, "SEX_A"))
    out["tenure"] = {1: "owned", 2: "rented"}.get(code(row, "HOUTENURE_A"))
    out["education"] = EDUCATION.get(code(row, "EDUCP_A"))
    if code(row, "EMPWRKLSW1_A") == 1 or code(row, "EMPNOWRK_A") == 1:
        out["work"] = "in_employment"
    elif code(row, "EMPNOWRK_A") == 2:
        why = code(row, "EMPWHYNOT_A")
        out["work"] = "retired" if why == 3 else "not_working" if why in (1, 2, 4, 5, 6, 7, 8) else None
    else:
        out["work"] = None
    out["children"] = {1: "one_or_more", 2: "none", 3: "none"}.get(code(row, "PARSTAT_A"))
    out["health_limitation"] = {1: "limited_a_lot", 2: "not_limited_a_lot"}.get(code(row, "DISAB3_A"))
    out["insurance"] = insurance(row)
    return out


def shares(weights, k):
    """Weighted percentages to one decimal, by largest remainder so they sum to exactly 100.0."""
    total = sum(weights)
    raw = [1000 * w / total for w in weights]
    floor = [int(x) for x in raw]
    for i in sorted(range(k), key=lambda i: raw[i] - floor[i], reverse=True)[: 1000 - sum(floor)]:
        floor[i] += 1
    return [f / 10 for f in floor]


def main(raw, out):
    os.makedirs(raw, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    path = os.path.join(raw, "adult24csv.zip")
    if not os.path.exists(path):
        subprocess.run(["curl", "-sSL", "--fail", "-m", "600", "-o", path, URL], check=True)
    blob = open(path, "rb").read()
    if hashlib.sha256(blob).hexdigest() != SHA:
        raise SystemExit("sha256 differs from the pinned one")
    cells = {sid: collections.defaultdict(lambda k=spec["k"]: [[0.0] * k, 0]) for sid, spec in STUDIES.items()}
    labels = {sid: collections.Counter() for sid in STUDIES}
    status = {sid: collections.Counter() for sid in STUDIES}
    rows = 0
    with zipfile.ZipFile(io.BytesIO(blob)) as book, book.open(MEMBER) as handle:
        for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8")):
            rows += 1
            weight = float(row["WTFA_A"])
            member = groups_of(row)
            for sid, spec in STUDIES.items():
                for c in spec["columns"]:
                    labels[sid][f"{c}={row[c].strip()}"] += 1
                answer, state = spec["read"](row)
                status[sid][state] += 1
                if answer is None:
                    continue
                for key in [("all", "all")] + [(dim, g) for dim, g in member.items() if g is not None]:
                    cell = cells[sid][key]
                    cell[0][answer] += weight
                    cell[1] += 1
    result = {"source": {"name": "National Health Interview Survey 2024, sample adult file", "url": URL, "sha256": SHA, "member": MEMBER, "rows": rows,
                         "weight": "WTFA_A", "min_group_n": MIN_N},
              "group_definitions": GROUPS, "studies": {}}
    for sid, spec in STUDIES.items():
        k = spec["k"]
        overall = cells[sid][("all", "all")]
        groups, dropped = {}, {}
        for (dim, g), (w, n) in sorted(cells[sid].items()):
            if dim == "all":
                continue
            if n < MIN_N:
                dropped[f"{dim}:{g}"] = n
                continue
            groups.setdefault(dim, {})[g] = {"real": shares(w, k), "n": n}
        labels_sorted = dict(sorted(labels[sid].items(), key=lambda kv: -kv[1])[:40])
        result["studies"][sid] = {"real": shares(overall[0], k), "n": overall[1], "groups": groups, "groups_dropped_for_n": dropped,
                                  "status": dict(status[sid]), "raw_label_counts": labels_sorted}
    with open(os.path.join(out, "nhis.json"), "w") as f:
        json.dump(result, f, indent=1)
    print(json.dumps({sid: [r["real"], r["n"], r["status"]] for sid, r in result["studies"].items()}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
