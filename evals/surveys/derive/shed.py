"""nxk benchmark v4, US money block: real answers, overall and by persona group, from the Federal Reserve's SHED 2024 public use file.

usage: python3 -I -B shed.py RAW OUT

Runs on the home server (respondent-level file). Downloads the public use zip into RAW (kept there until the job is deleted), checks the pinned
sha256, reads public2024.csv from the zip in memory and writes OUT/shed.json: for every study the weighted distribution and the unweighted n,
overall and for every group with at least 100 respondents, plus the unweighted counts of each answer label. No respondent row leaves the server.

Source: Board of Governors of the Federal Reserve System, Survey of Household Economics and Decisionmaking 2024, public use data (public domain),
fieldwork October 2024, Ipsos KnowledgePanel (probability-based online panel), adults 18 and over. Weight: `weight` (the one the Board's report uses;
`weight_pop` gives the same shares). Answers recorded as refused or left blank are excluded from a study's base, as the Board's report does.

Groups are defined on PersonaGen 4.0 field names and values. Profile variables as the PersonaGen real-record control reads them
(evidence/real-control-2026-11-11/shed/scripts/shed_sample.py): age ppage, sex ppgender, household income ppinc7, home tenure pprent (the household's,
not the respondent's own GH1), education ED0, own children under 18 at home L0_b, work status D1A then D1I or D22_i (retired), else not working.
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

URL = "https://www.federalreserve.gov/consumerscommunities/files/SHED_public_use_data_2024_(CSV).zip"
SHA = "b455d02356a0c01a02d7f478c02d772515491564e905ce13db55f272f83567c1"
MEMBER = "public2024.csv"
MIN_N = 100


def norm(value):
    return value.strip().lower().replace("’", "'").replace("\x92", "'")


def label_map(*pairs):
    """Maps a raw label (matched by lower-case prefix) to an option index; None excludes the answer."""
    def read(value):
        v = norm(value)
        if v in ("", "refused"):
            return None, "excluded"
        for start, index in pairs:
            if v.startswith(start):
                return index, "ok"
        return None, "unmapped"
    return read


YES_NO = label_map(("yes", 0), ("no", 1))


def any_yes(columns):
    """Yes when any column is Yes; No when all are No; excluded when any is missing and none is Yes."""
    def read(row):
        values = [norm(row[c]) for c in columns]
        if any(v == "yes" for v in values):
            return 0, "ok"
        if all(v == "no" for v in values):
            return 1, "ok"
        if all(v in ("yes", "no", "", "refused") for v in values):
            return None, "excluded"
        return None, "unmapped"
    return read


def column(name, reader):
    return lambda row: reader(row[name])


def not_retired(row):
    return norm(row["D1I"]) == "no"


def pays_rent(row):
    return norm(row["GH1"]).startswith("pay rent")


# Each study: the column(s) read, the universe (who was asked), the answer reader.
STUDIES = {
    "shed-emergency-savings-3-months": dict(columns=["EF1"], universe=None, read=column("EF1", YES_NO)),
    "shed-went-without-medical-care-cost": dict(columns=[f"E1_{k}" for k in "abcde"], universe=None, read=any_yes([f"E1_{k}" for k in "abcde"])),
    "shed-buy-now-pay-later": dict(columns=["BNPL1"], universe=None, read=column("BNPL1", YES_NO)),
    "shed-retirement-savings-on-track": dict(columns=["K0"], universe=not_retired, read=column("K0", label_map(("yes", 0), ("no", 1), ("don", 2)))),
    "shed-food-sufficiency": dict(columns=["FD3"], universe=None, read=column("FD3", label_map(
        ("enough of the kinds", 0), ("enough, but not always", 1), ("sometimes not enough", 2), ("often not enough", 3)))),
    "shed-price-changes-effect": dict(columns=["INF4"], universe=None, read=column("INF4", label_map(
        ("much worse", 0), ("somewhat worse", 1), ("little or no effect", 2), ("somewhat better", 3), ("much better", 3)))),
    "shed-renters-behind-on-rent": dict(columns=["R11"], universe=pays_rent, read=column("R11", YES_NO)),
    "shed-has-retirement-savings-account": dict(columns=["K21_a"], universe=None, read=column("K21_a", YES_NO)),
    "shed-pays-all-bills-in-full": dict(columns=["EF5C"], universe=None, read=column("EF5C", YES_NO)),
}
OPTIONS = {"shed-retirement-savings-on-track": 3, "shed-food-sufficiency": 4, "shed-price-changes-effect": 4}

EDUCATION = [("less than high school", "hs_or_less"), ("high school degree or ged", "hs_or_less"), ("some college but no degree", "some_college"),
             ("certificate or technical degree", "some_college"), ("associate degree", "some_college"), ("bachelor", "degree"), ("master", "degree"),
             ("professional degree", "degree"), ("doctoral degree", "degree")]
INCOME = {"less than $10,000": "under_25k", "$10,000 to $24,999": "under_25k", "$25,000 to $49,999": "25k_50k", "$50,000 to $74,999": "50k_100k",
          "$75,000 to $99,999": "50k_100k", "$100,000 to $149,999": "100k_150k", "$150,000 or more": "150k_plus"}

# The group definitions in PersonaGen 4.0 field names and values (US).
GROUPS = {
    "age": {"18_29": {"field": "age_years", "min": 18, "max": 29}, "30_44": {"field": "age_years", "min": 30, "max": 44},
            "45_64": {"field": "age_years", "min": 45, "max": 64}, "65_plus": {"field": "age_years", "min": 65, "max": 100}},
    "sex": {"female": {"field": "sex_at_birth", "in": ["female"]}, "male": {"field": "sex_at_birth", "in": ["male"]}},
    "income": {"under_25k": {"field": "household_income_before_tax_per_year", "in": ["under_25000_usd"]},
               "25k_50k": {"field": "household_income_before_tax_per_year", "in": ["25000_to_49999_usd"]},
               "50k_100k": {"field": "household_income_before_tax_per_year", "in": ["50000_to_74999_usd", "75000_to_99999_usd"]},
               "100k_150k": {"field": "household_income_before_tax_per_year", "in": ["100000_to_149999_usd"]},
               "150k_plus": {"field": "household_income_before_tax_per_year", "in": ["150000_to_199999_usd", "200000_usd_or_more"]}},
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
}


def groups_of(row):
    """The group of each dimension the respondent belongs to (None when the profile variable is missing)."""
    out = {}
    age = int(row["ppage"])
    out["age"] = "18_29" if age < 30 else "30_44" if age < 45 else "45_64" if age < 65 else "65_plus"
    out["sex"] = {"male": "male", "female": "female"}.get(norm(row["ppgender"]))
    out["income"] = INCOME.get(norm(row["ppinc7"]))
    tenure = norm(row["pprent"])
    out["tenure"] = "owned" if tenure.startswith("owned") else "rented" if tenure.startswith("rented") else None
    edu = norm(row["ED0"])
    out["education"] = next((g for start, g in EDUCATION if edu.startswith(start)), None)
    if norm(row["D1A"]) == "yes":
        out["work"] = "in_employment"
    elif norm(row["D1A"]) == "no":
        out["work"] = "retired" if norm(row["D1I"]) == "yes" or norm(row["D22_i"]) == "yes" else "not_working"
    else:
        out["work"] = None
    kids = norm(row["L0_b"])
    out["children"] = "one_or_more" if kids == "yes" else "none" if kids == "no" else None
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
    path = os.path.join(raw, "shed2024.zip")
    if not os.path.exists(path):
        subprocess.run(["curl", "-sSL", "--fail", "-m", "600", "-o", path, URL], check=True)
    blob = open(path, "rb").read()
    if hashlib.sha256(blob).hexdigest() != SHA:
        raise SystemExit("sha256 differs from the pinned one")
    k_of = {sid: OPTIONS.get(sid, 2) for sid in STUDIES}
    cells = {sid: collections.defaultdict(lambda k=k_of[sid]: [[0.0] * k, 0]) for sid in STUDIES}
    labels = {sid: collections.Counter() for sid in STUDIES}
    status = {sid: collections.Counter() for sid in STUDIES}
    rows = 0
    with zipfile.ZipFile(io.BytesIO(blob)) as book, book.open(MEMBER) as handle:
        for row in csv.DictReader(io.TextIOWrapper(handle, encoding="latin-1")):
            rows += 1
            weight = float(row["weight"])
            member = groups_of(row)
            for sid, spec in STUDIES.items():
                if spec["universe"] is not None and not spec["universe"](row):
                    status[sid]["outside_universe"] += 1
                    continue
                for c in spec["columns"]:
                    labels[sid][f"{c}={row[c]}"] += 1
                answer, state = spec["read"](row)
                status[sid][state] += 1
                if answer is None:
                    continue
                keys = [("all", "all")] + [(dim, g) for dim, g in member.items() if g is not None]
                for key in keys:
                    cell = cells[sid][key]
                    cell[0][answer] += weight
                    cell[1] += 1
    result = {"source": {"name": "Survey of Household Economics and Decisionmaking 2024, public use data", "url": URL, "sha256": SHA, "member": MEMBER,
                         "rows": rows, "weight": "weight", "min_group_n": MIN_N},
              "group_definitions": GROUPS, "studies": {}}
    for sid in STUDIES:
        k = k_of[sid]
        overall = cells[sid][("all", "all")]
        groups, dropped = {}, {}
        for (dim, g), (w, n) in sorted(cells[sid].items()):
            if dim == "all":
                continue
            if n < MIN_N:
                dropped[f"{dim}:{g}"] = n
                continue
            groups.setdefault(dim, {})[g] = {"real": shares(w, k), "n": n}
        result["studies"][sid] = {"real": shares(overall[0], k), "n": overall[1], "groups": groups, "groups_dropped_for_n": dropped,
                                  "status": dict(status[sid]), "raw_label_counts": dict(labels[sid].most_common())}
    with open(os.path.join(out, "shed.json"), "w") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
    print(json.dumps({sid: [r["real"], r["n"], r["status"]] for sid, r in result["studies"].items()}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
