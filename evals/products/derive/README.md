# How products.json was made

The published figures behind [../products.json](../products.json) were read in
two batches, matching each product's `batch`. The scripts are kept as they were
run on 13 November 2026, renamed by batch. Their paths name the folder they ran
in then, which is why they are left out of the format and lint checks.

## Batch 1: 13 products

Social apps and AI assistants (Ofcom), low-carbon home technology (English
Housing Survey) and paying by phone (FCA, 2022).

- **In:** two sources.
  - `ofcom.json`: Ofcom's figures, as read from its PDF data tables.
  - The other figures are written into the script, each with its source and
    link.
- **Run:**

  ```bash
  node batch-1.mjs items.json known-spec.json
  ```

- **Out:** two files.
  - The products, with their groups.
  - A scan spec with one version for each product.

## Batch 2: 19 products

Gambling activities (Gambling Commission) and financial products (FCA, 2024).

- **In:** the two regulators' workbooks named in `batch-2-extract.py`,
  downloaded into `data-gsgb/` and `data-fca/` next to the scripts. Their links
  are in each figure's `url`.
- **Run:** in this folder, the extract first, then the build.

  ```bash
  python3 -I batch-2-extract.py batch-2-figures.json
  ```

  ```bash
  node batch-2.mjs items2.json known2-spec.json
  ```

- **Out:**
  - `batch-2-figures.json`: the figures exactly as the tables give them.
  - The same two files as batch 1.

## Both

- **Products file:** `products.json` joins the two batches' products, adding
  each product's name and batch.
- **Conditions:** every published group gets a condition on the made-up people
  (`cond`), and the scripts stop if a group has none.
- **`xlsx.py`:** reads an `.xlsx` with the standard library only. On its own,
  it lists a workbook's sheets, prints one, or finds a cell's text:

  ```bash
  python3 -I xlsx.py <file.xlsx> names
  ```

  ```bash
  python3 -I xlsx.py <file.xlsx> sheet "<name>"
  ```

  ```bash
  python3 -I xlsx.py <file.xlsx> find "<text>"
  ```
