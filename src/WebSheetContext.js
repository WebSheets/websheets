import Emitter from './Emitter';


export default class WebSheetContext {
    constructor() {
        this.sheets = {};
        this.dependencies = {};

        this.events = new Emitter();
    }

    register(sheet, name) {
        this.sheets[name.toUpperCase()] = sheet;
        sheet.name = name;

        sheet.valueUpdates.onAll((cellID, value) => {
            this.events.fire('value', name, cellID, value);
        });

        sheet.calculatedUpdates.onAll((cellID, value) => {
            this.events.fire('calculated', name, cellID, value);
        });
    }

    getSheet(sheetName) {
        sheetName = sheetName.toUpperCase();
        if (!this.sheets.hasOwnProperty(sheetName)) return null;
        return this.sheets[sheetName]
    }

    lookup(sheetName, cellID) {
        sheetName = sheetName.toUpperCase();
        if (!this.sheets.hasOwnProperty(sheetName)) return null;
        return this.sheets[sheetName].getCalculatedValueAtID(cellID);
    }

    setDependency(fromSheet, fromSheetCellID, toSheetName, toCellID, cb) {
        toSheetName = toSheetName.toUpperCase();
        if (!this.sheets.hasOwnProperty(sheetName)) return;
        var fromID = `${fromSheet.name.toUpperCase()}!${fromSheetCellID}`;
        var toID = `${toSheetName}!${toCellID}`;
        this.dependencies[fromID] = this.dependencies[fromID] || [];

        var updateCB = (value, type) => {
            // Ignore value updates that preceed calculated updates
            if (type === 'value' && value[0] === '=') return;
            cb(value);
        };

        this.dependencies[fromID].push([toSheetName, toCellID, updateCB]);

        this.sheets[toSheetName].valueUpdates.on(toCellID, updateCB);
        this.sheets[toSheetName].calculatedUpdates.on(toCellID, updateCB);
    }

    clearDependencies(fromSheet, fromSheetCellID) {
        var fromID = `${fromSheet.name.toUpperCase()}!${fromSheetCellID}`;
        if (!this.dependencies.hasOwnProperty(fromID)) return;
        this.dependencies[fromID].forEach(data => {
            this.sheets[data[0]].valueUpdates.off(data[1], data[2]);
            this.sheets[data[0]].calculatedUpdates.off(data[1], data[2]);
        });
        this.dependencies[fromID] = [];
    }
}