# Websheets

[![Build Status](https://travis-ci.org/WebSheets/websheets.svg?branch=master)](https://travis-ci.org/WebSheets/websheets)

An experiment to make a spreadsheet engine for the web.


## Features

- Formulas
    + Addition, subtraction, multiplication, division (with order of operations)
    + Ability to reference individual cells
    + Ability to pass ranges of cells (in two dimensions) as function arguments
    + Very large list of compatible Excel-style functions
    + Dynamically update as referenced values update
- Dynamically sized columns
- Keyboard interactions similar to Excel
- Drag and drop
    + Drag cell to move
    + Drag corner of cell to copy
    + Copied cells adjust their formulas
        + Support for pinning identifiers with `$` (e.g., `$A$1`, `A$2`)
- Import parsed data (`loadData`)
- Supports Excel-style circular reference convergence
