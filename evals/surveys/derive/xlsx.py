"""A minimal reader for published .xlsx tables (standard library only): sheet names, and a sheet as a grid of cell values.
The UK derive scripts load it with importlib (they run with python3 -I, so the script's folder is not on sys.path)."""
import io
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "p": "http://schemas.openxmlformats.org/package/2006/relationships"}


def _col(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def _row(ref):
    return int(re.search(r"\d+", ref).group(0)) - 1


class Book:
    def __init__(self, blob):
        self.zip = zipfile.ZipFile(io.BytesIO(blob))
        wb = ET.fromstring(self.zip.read("xl/workbook.xml"))
        rels = ET.fromstring(self.zip.read("xl/_rels/workbook.xml.rels"))
        target = {r.get("Id"): r.get("Target") for r in rels.findall("p:Relationship", NS)}
        self.sheets = {}
        for s in wb.find("m:sheets", NS).findall("m:sheet", NS):
            t = target[s.get(f"{{{NS['r']}}}id")].lstrip("/")
            self.sheets[s.get("name")] = t if t.startswith("xl/") else "xl/" + t
        self.strings = []
        if "xl/sharedStrings.xml" in self.zip.namelist():
            for si in ET.fromstring(self.zip.read("xl/sharedStrings.xml")).findall("m:si", NS):
                self.strings.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))

    def grid(self, name):
        """The sheet as a list of rows (lists), empty cells as None; numbers as float, text as str."""
        root = ET.fromstring(self.zip.read(self.sheets[name]))
        cells = {}
        for c in root.iter(f"{{{NS['m']}}}c"):
            ref, kind = c.get("r"), c.get("t")
            v = c.find("m:v", NS)
            if kind == "s" and v is not None:
                value = self.strings[int(v.text)]
            elif kind == "inlineStr":
                value = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
            elif v is None:
                continue
            elif kind in ("str", "e"):
                value = v.text
            elif kind == "b":
                value = v.text == "1"
            else:
                try:
                    value = float(v.text)
                except (TypeError, ValueError):
                    value = v.text
            cells[(_row(ref), _col(ref))] = value
        if not cells:
            return []
        rows = max(r for r, _ in cells) + 1
        cols = max(c for _, c in cells) + 1
        return [[cells.get((r, c)) for c in range(cols)] for r in range(rows)]
