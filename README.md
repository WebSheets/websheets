# Websheets

An experiment to make a spreadsheet engine for the web.

## Features

- Expressions
    + Addition, subtraction, multiplication, division (with order of operations)
    + Ability to reference individual cells
    + Ability to pass ranges of cells (in two dimensions) as function arguments
    + Large list of compatible Excel-style functions
    + Dynamically update as referenced values update
- Dynamically sized columns
- Keyboard interactions similar to Excel
- Drag and drop
    + Drag cell to move
    + Drag corner of cell to copy
    + Copied cells adjust their formulas
- Import parsed tabular data (`loadData`)
