# Pull published figures by group out of two regulators' spreadsheets, exactly as they appear in the tables.
#   python3 -I batch-2-extract.py batch-2-figures.json
# Gambling Commission, Gambling Survey for Great Britain 2024 annual data tables, Table B.9 (past four weeks, by
# activity, sex and age). FCA Financial Lives 2024, tables volume 3, the product holding table (column percentages).
import json, sys
sys.path.insert(0, ".")
from xlsx import Book

out = []

# --- Gambling Commission ---------------------------------------------------------------------------------------
GC = Book("data-gsgb/gsgb-2024-annual-data-tables.xlsx").rows("Table B.9")
header = [str(x).replace("\n", " ").replace("(percentage)", "").strip() for x in GC[1]]
want = {
    "lottery_draw": "Tickets for National Lottery d",
    "charity_lottery": "Tickets for other charity lott",
    "scratchcards": "Scratchcards",
    "online_instant_win": "Online instant win games",
    "sports_betting_online": "   Betting on sports and racin",   # first of the two rows: online or via an app
    "bingo_venue": "   Bingo played at a venue",
    "online_casino": "   Casino games played online",
    "football_pools": "Football pools",
}
for key, start in want.items():
    row = next(r for r in GC if r and str(r[0]).startswith(start))
    figures = []
    for label, value in zip(header[2:], row[2:]):
        dimension = "sex" if label.startswith("All ") else "age"
        figures.append({"dimension": dimension, "group": label, "percent": round(100 * float(value), 1)})
    out.append({"id": key, "what": str(row[0]).strip(), "source": "Gambling Survey for Great Britain, annual report 2024, data tables, Table B.9 (Gambling Commission)", "url": "https://assets.ctfassets.net/j16ev64qyf6l/2e5AG2TZseBH7X0fQf9iiD/50415e98f606e641a3efa206a5f0f422/GSGB_Y2_2024__Annual_Data_Tables_Correction.xlsx", "population": "adults 18+ in Great Britain", "measure": "took part in the past four weeks", "all": round(100 * float(row[1]), 1), "figures": figures})

# --- FCA -------------------------------------------------------------------------------------------------------
FCA = Book("data-fca/fls-2024-vol3-product-ownership.xlsx").rows("ProductHolding")
labels = [str(x).strip() for x in FCA[2]]
columns = {"sex": ["Male", "Female"], "age": ["18-24", "25-34", "35-44", "45-54", "55-64", "65-74", "75+"], "tenure": ["Own outright", "Mortgage", "Renting"], "household income": ["Less than £15k", "£15k - <£30k", "£30k - <£50k", "£50k - <£70k", "£70k - <£100k", "£100k - <£250k"]}
index = {}
for dimension, names in columns.items():
    for name in names:
        index[(dimension, name)] = labels.index(name)   # the first column with that heading
products = {
    "premium_bonds": ("Premium bonds", "holds it"),
    "stocks_shares_isa": ("Stocks and shares ISA", "holds it"),
    "crypto": ("Cryptocurrencies or cryptoassets", "holds it"),
    "bnpl": ("Deferred payment credit", "has it now or used it in the last 12 months"),
    "catalogue_credit": ("Catalogue credit or shopping accounts", "has it now or used it in the last 12 months"),
    "high_cost_credit": ("Any high-cost credit or loan", "has it now or used it in the last 12 months"),
    "pet_insurance": ("Pet insurance", "holds it"),
    "phone_insurance": ("Mobile phone insurance", "holds it"),
    "annual_travel_insurance": ("Multi-trip (annual) travel insurance", "holds it"),
    "private_medical": ("Private medical insurance", "holds it"),
    "emoney_account": ("Current account with a payment services institution or an e-money prov", "holds it"),
}
for key, (start, measure) in products.items():
    n = next(i for i, r in enumerate(FCA) if i >= 8 and r and str(r[0]).strip().startswith(start))
    col = next(FCA[k] for k in range(n, n + 5) if len(FCA[k]) > 1 and str(FCA[k][1]).strip() == "Col %")
    figures = []
    for (dimension, name), c in index.items():
        cell = str(col[c]).strip()
        if cell.startswith("[") or cell in ("-", "*", ""):
            continue   # the FCA brackets or blanks a figure with too small a base
        figures.append({"dimension": dimension, "group": name, "percent": round(100 * float(cell), 1)})
    out.append({"id": key, "what": str(FCA[n][0]).strip(), "source": "Financial Lives 2024 survey, data tables volume 3: product ownership (FCA)", "url": "https://www.fca.org.uk/publication/financial-lives/financial-lives-survey-2024-tables-volume-3-product-ownership.xlsx", "population": "UK adults 18+", "measure": measure, "all": round(100 * float(col[2]), 1), "figures": figures})

json.dump(out, open(sys.argv[1], "w"), indent=1, ensure_ascii=False)
for item in out:
    by = {}
    for f in item["figures"]:
        by.setdefault(f["dimension"], []).append(f"{f['group']} {f['percent']}")
    print(f"{item['id']} ({item['what'][:44]}; all {item['all']}%)")
    for dimension, values in by.items():
        print(f"   {dimension}: " + ", ".join(values))
