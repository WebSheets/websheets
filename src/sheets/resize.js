WebSheet.prototype.addColumn = function() {
    this.width += 1;
    this.columnWidths.push(DEFAULT_COLUMN_WIDTH);
    this.forceRerender();
};

WebSheet.prototype.addRow = function() {
    this.height += 1;
    this.data.push(new Array(this.width));
    this.calculated.push(new Array(this.width));
    this.formatting.push(new Array(this.width));
    this.forceRerender();
};

WebSheet.prototype.insertColumnBefore = function(idx) {
    this.width += 1;
    this.columnWidths.splice(idx, 0, DEFAULT_COLUMN_WIDTH);
    for (var i = 0; i < this.height; i++) {
        if (this.data[i]) this.data[i].splice(idx, 0, null);
        if (this.calculated[i]) this.calculated[i].splice(idx, 0, null);
        if (this.formatting[i]) this.formatting[i].splice(idx, 0, null);
    }
    this.forceRerender();
};

WebSheet.prototype.insertRowBefore = function(idx) {
    this.height += 1;
    this.data.splice(idx, 0, new Array(this.width));
    this.calculated.splice(idx, 0, new Array(this.width));
    this.formatting.splice(idx, 0, new Array(this.width));
    this.forceRerender();
};

WebSheet.prototype.popColumn = function() {
    if (this.width < 2) throw new Error('Cannot make spreadsheet that small');
    this.width -= 1;
    this.columnWidths.pop();
    for (var i = 0; i < this.height; i++) {
        if (this.data[i] && this.data[i].length > this.width) this.data[i].pop();
        if (this.calculated[i] && this.calculated[i].length > this.width) this.calculated[i].pop();
        if (this.formatting[i] && this.formatting[i].length > this.width) this.formatting[i].pop();
    }
    this.forceRerender();
};

WebSheet.prototype.popRow = function() {
    if (this.height < 2) throw new Error('Cannot make spreadsheet that small');
    this.height -= 1;
    this.data.pop();
    this.calculated.pop();
    this.formatting.pop();
    this.forceRerender();
};

WebSheet.prototype.removeColumn = function(idx) {
    if (this.width < 2) throw new Error('Cannot make spreadsheet that small');
    if (idx < 0 || idx >= this.width) throw new Error('Removing cells that do not exist');
    this.width -= 1;
    this.columnWidths.splice(idx, 1);
    for (var i = 0; i < this.height; i++) {
        if (this.data[i]) this.data[i].splice(idx, 1);
        if (this.calculated[i]) this.calculated[i].splice(idx, 1);
        if (this.formatting[i]) this.formatting[i].splice(idx, 1);
    }
    this.forceRerender();
};

WebSheet.prototype.removeRow = function(i) {
    if (this.height < 2) throw new Error('Cannot make spreadsheet that small');
    if (i < 0 || i >= this.width) throw new Error('Removing cells that do not exist');
    this.height -= 1;
    this.data.splice(i, 1);
    this.calculated.splice(i, 1);
    this.formatting.splice(i, 1);
    this.forceRerender();
};
