# How studies.json was made

These scripts read each survey's files and wrote [../studies.json](../studies.json).
They are kept as they were run on 11 and 12 November 2026. Their paths name the
folder they ran in then (`benchmarks/v4/`), which is why they are left out of the
format and lint checks.

## The steps

1. **One script for each source** downloads its file, checks the file's pinned
   sha256 and writes the source's answers into `aggregates/<source>.json`:
   weighted shares overall and for each group of at least 100 people, with
   the unweighted counts. Each script's header gives its source and what it
   reads. [../sources.md](../sources.md) lists every download, with its URL,
   licence, size and checksum.

   ```bash
   python3 -I -B <source>.py RAW OUT
   ```

2. **`build.py`** joins the aggregates into `studies.json`. It adds what a
   survey's files don't say: the question as nxk asks it, the option labels,
   who was asked, and the fields that define each group. Then it checks the
   result:
   - every group names a field and values that exist for its country;
   - every set of shares sums to 100, within rounding;
   - every group kept has at least 100 people;
   - no study has more than 6 options.

   ```bash
   python3 -I -B build.py --schema schema-4.0.json
   ```

## The sources

| Script | Survey | Where it ran |
| --- | --- | --- |
| `shed.py` | US: the Federal Reserve's Survey of Household Economics and Decisionmaking 2024 | Respondent-level file, so on a separate machine. No respondent row left it; only `aggregates/shed.json` came back. |
| `nhis.py` | US: the National Health Interview Survey 2024 | The same as SHED. |
| `ons_opn.py` | UK: ONS Opinions and Lifestyle Survey | Published tables, read locally. |
| `fsa.py` | UK: FSA Food and You 2, Wave 11 | Published tables, read locally. |
| `desnz.py` | UK: DESNZ Public Attitudes Tracker | Published tables, read locally. |
| `ces.py` | UK: DCMS Community and Engagement Survey 2025/26 | Published tables, read locally. |

`xlsx.py` and `ods.py` read spreadsheets with the standard library only. The
UK scripts load them with `importlib`, because `python3 -I` leaves the
script's folder off `sys.path`.
