"""A minimal reader for published .ods tables (standard library only), with the same interface as xlsx.py: `Book(blob).sheets` (names) and
`Book(blob).grid(name)`, a sheet as a list of rows, empty cells as None, numbers as float, text as str.
The UK derive scripts load it with importlib (they run with python3 -I, so the script's folder is not on sys.path)."""
import io
import zipfile
import xml.etree.ElementTree as ET

T = "urn:oasis:names:tc:opendocument:xmlns:table:1.0"
O = "urn:oasis:names:tc:opendocument:xmlns:office:1.0"
X = "urn:oasis:names:tc:opendocument:xmlns:text:1.0"
MAX_REPEAT = 1000  # trailing blank rows and columns are stored as one element repeated to the sheet's edge


def _flat(node):
    s = node.text or ""
    for child in node:
        if child.tag == f"{{{X}}}s":
            s += " " * int(child.get(f"{{{X}}}c", "1"))
        elif child.tag == f"{{{X}}}tab":
            s += "\t"
        elif child.tag == f"{{{X}}}line-break":
            s += "\n"
        else:
            s += _flat(child)
        s += child.tail or ""
    return s


def _text(cell):
    return "\n".join(_flat(p) for p in cell.findall(f"{{{X}}}p"))


def _value(cell):
    kind = cell.get(f"{{{O}}}value-type")
    if kind in ("float", "percentage", "currency"):
        return float(cell.get(f"{{{O}}}value"))
    if kind is None:
        return None
    text = _text(cell)
    return text if text != "" else None


class Book:
    def __init__(self, blob):
        root = ET.fromstring(zipfile.ZipFile(io.BytesIO(blob)).read("content.xml"))
        self._tables = {t.get(f"{{{T}}}name"): t for t in root.iter(f"{{{T}}}table")}
        self.sheets = list(self._tables)

    def grid(self, name):
        rows = []
        for row in self._tables[name].iter(f"{{{T}}}table-row"):
            cells = []
            for cell in row:
                if cell.tag not in (f"{{{T}}}table-cell", f"{{{T}}}covered-table-cell"):
                    continue
                n = min(int(cell.get(f"{{{T}}}number-columns-repeated", "1")), MAX_REPEAT)
                cells.extend([_value(cell)] * n)
            while cells and cells[-1] is None:
                cells.pop()
            n = min(int(row.get(f"{{{T}}}number-rows-repeated", "1")), MAX_REPEAT)
            rows.extend([list(cells) for _ in range(n)])
        while rows and not rows[-1]:
            rows.pop()
        return rows
