function getCellID(row, column) {
    var base = '';
    var character;

    row += 1;

    do {
        character = column % 26;
        column -= character;
        column /= 26;
        base = String.fromCharCode(character + 65) + base;
    } while (column);
    return base + row;
}

var cellPosCache = {};
function getCellPos(id) {
    if (id in cellPosCache) return cellPosCache[id];
    var matches = /^([a-z]+)([0-9]+)$/i.exec(id);
    var charBit = matches[1];
    var character;
    var col = 0;
    while (charBit) {
        character = charBit.charCodeAt(0) - 65;
        col *= 26;
        col += character;
        charBit = charBit.substr(1);
    }
    var output = {col: col, row: matches[2] - 1};
    cellPosCache[id] = output;
    return output;
}

WebSheet.getCellID = getCellID;
WebSheet.getCellPos = getCellPos;
