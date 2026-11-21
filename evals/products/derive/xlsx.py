# Read an .xlsx with the standard library only: sheet names, and a sheet as rows of cell text.
#   python3 -I xlsx.py <file> names
#   python3 -I xlsx.py <file> sheet "<name>" [max rows] [max cols]
#   python3 -I xlsx.py <file> find "<text>"        sheets and rows whose text contains it
import re, sys, zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main", "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def col(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


class Book:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.strings = []
        if "xl/sharedStrings.xml" in self.z.namelist():
            for si in ET.parse(self.z.open("xl/sharedStrings.xml")).getroot().findall("m:si", NS):
                self.strings.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
        rels = {r.get("Id"): r.get("Target") for r in ET.parse(self.z.open("xl/_rels/workbook.xml.rels")).getroot()}
        self.sheets = {}
        for s in ET.parse(self.z.open("xl/workbook.xml")).getroot().find("m:sheets", NS):
            target = rels[s.get("{%s}id" % NS["r"])]
            self.sheets[s.get("name")] = ("xl/" + target) if not target.startswith("/") else target[1:]

    def rows(self, name):
        out = []
        for row in ET.parse(self.z.open(self.sheets[name])).getroot().iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if c.get("t") == "inlineStr":
                    text = "".join(t.text or "" for t in c.iter("{%s}t" % NS["m"]))
                elif v is None:
                    continue
                elif c.get("t") == "s":
                    text = self.strings[int(v.text)]
                else:
                    text = v.text
                cells[col(c.get("r"))] = text
            if cells:
                out.append([cells.get(i, "") for i in range(max(cells) + 1)])
            else:
                out.append([])
        return out


if __name__ == "__main__":
    book = Book(sys.argv[1])
    what = sys.argv[2]
    if what == "names":
        for name in book.sheets:
            print(name)
    elif what == "sheet":
        rows = book.rows(sys.argv[3])
        for row in rows[: int(sys.argv[4]) if len(sys.argv) > 4 else 60]:
            print(" | ".join(str(x)[:28] for x in row[: int(sys.argv[5]) if len(sys.argv) > 5 else 14]))
    elif what == "find":
        needle = sys.argv[3].lower()
        for name in book.sheets:
            for n, row in enumerate(book.rows(name)):
                if any(needle in str(x).lower() for x in row):
                    print(f"{name} | row {n} | " + " | ".join(str(x)[:40] for x in row[:6]))
