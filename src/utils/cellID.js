
export function getCellID(row, column) {
    var base = '';

    row += 1;

    do {
        let character = column % 26;
        column -= character;
        column /= 26;
        base = String.fromCharCode(character + 65) + base;
    } while (column);

    return base + row;
};

var cellPosCache = {};
export function getCellPos(id) {
    id = id.toUpperCase();
    if (id in cellPosCache) return cellPosCache[id];
    var matches = /^([a-z]+)([0-9]+)$/i.exec(id);
    var charBit = matches[1];
    var col = 0;
    while (charBit) {
        let character = charBit.charCodeAt(0) - 65;
        col *= 26;
        col += character;
        charBit = charBit.substr(1);
    }
    var output = new CellPosition(col, matches[2] - 1);
    cellPosCache[id] = output;
    return output;
};

function CellPosition(col, row) {
    this.col = col;
    this.row = row;
}
