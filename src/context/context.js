function WebSheetContext() {
    this.sheets = {};
    this.dependencies = {};

    this.events = new Emitter();
}

WebSheetContext.prototype.register = function(sheet, name) {
    this.sheets[name.toUpperCase()] = sheet;
    sheet.name = name;

    sheet.valueUpdates.onAll(function(cellID, value) {
        this.events.fire('value', name, cellID, value);
    }.bind(this));

    sheet.calculatedUpdates.onAll(function(cellID, value) {
        this.events.fire('calculated', name, cellID, value);
    }.bind(this));
};

WebSheetContext.prototype.getSheet = function(sheetName) {
    sheetName = sheetName.toUpperCase();
    if (!(sheetName in this.sheets)) return null;
    return this.sheets[sheetName]
};

WebSheetContext.prototype.lookup = function(sheetName, cellID) {
    sheetName = sheetName.toUpperCase();
    if (!(sheetName in this.sheets)) return null;
    return this.sheets[sheetName].getCalculatedValueAtID(cellID);
};

WebSheetContext.prototype.setDependency = function(fromSheet, fromSheetCellID, toSheetName, toCellID, cb) {
    toSheetName = toSheetName.toUpperCase();
    if (!(toSheetName in this.sheets)) return;
    var fromID = fromSheet.name.toUpperCase() + '!' + fromSheetCellID;
    var toID = toSheetName + '!' + toCellID;
    this.dependencies[fromID] = this.dependencies[fromID] || [];

    var updateCB = function(value, type) {
        // Ignore value updates that preceed calculated updates
        if (type === 'value' && value[0] === '=') return;
        cb(value);
    };

    this.dependencies[fromID].push([toSheetName, toCellID, updateCB]);

    this.sheets[toSheetName].valueUpdates.on(toCellID, updateCB);
    this.sheets[toSheetName].calculatedUpdates.on(toCellID, updateCB);
};

WebSheetContext.prototype.clearDependencies = function(fromSheet, fromSheetCellID) {
    var fromID = fromSheet.name.toUpperCase() + '!' + fromSheetCellID;
    if (!(fromID in this.dependencies)) return;
    this.dependencies[fromID].forEach(function(data) {
        this.sheets[data[0]].valueUpdates.off(data[1], data[2]);
        this.sheets[data[0]].calculatedUpdates.off(data[1], data[2]);
    }, this);
    this.dependencies[fromID] = [];
};


WebSheet.WebSheetContext = WebSheetContext;
