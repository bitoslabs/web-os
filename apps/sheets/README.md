# Sheets

Spreadsheet for the Bitos office suite. Part of **Bitos Office** alongside
`apps/docs` and `apps/slides`.

State: the workbook (sheets, cells, charts, active sheet) persists through
`src/office/store.js` (IndexedDB `office` store with a `localStorage` mirror and
fallback).

Cells hold raw input. Input beginning with `=` is evaluated through
`src/office/formula.js`: arithmetic (`+ - * / ^`), parentheses, comparisons,
cell refs (`A1`), ranges (`A1:B9`), and `SUM`, `AVERAGE`/`AVG`, `MIN`, `MAX`,
`COUNT`, `IF`. Circular references report `#CYCLE!`. Double-click a cell to edit;
the formula bar edits the selected cell. Drag across cells to select a range; the
status bar shows `sum / avg / count` for numeric cells, and the sort buttons order
the selected range by its first column (A-Z / Z-A). Bold a cell, apply a number
format (general / number / currency / percent) or a fill colour from the ribbon;
add sheets as tabs, right-click a tab to rename. Insert bar / line / pie charts over a range
(`A1:B5`) via the chart button; charts render as inline SVG (`src/office/chart.js`),
live in the chart strip below the grid, and are saved with the sheet.

Import and export: **save** writes `.xlsx` through `src/office/xlsx.js` (ZIP +
SpreadsheetML, no vendored parser), including bold, number formats, and fills via
a generated stylesheet; **import** opens `.xlsx` or `.csv`/`.tsv` and recovers
those styles; **csv** exports the active sheet. The Files app dispatches `.xlsx`
here.

Native requirements: none in the preview. The booted OS should keep workbooks on
the user data partition and write bytes back through `fs.writeBytes`.

Acceptance checks:

- `=SUM(B2:B3)` totals a column and updates when inputs change.
- a circular reference shows `#CYCLE!` instead of hanging.
- save `.xlsx`, reopen it, and see the same cells and formulas.
- insert a chart over a range and see it update when the cells change.
- import a CSV, edit, export, and re-import to the same values.
