export class Runner {
    constructor(values, sheets = {}) {
        this.data = values;
        this.sheets = sheets;
    }
    getCalculatedValueAtPos(row, col) {
        return this.getCalculatedValueAtID(getCellID(row, col));
    }
    getCalculatedValueAtID(id) {
        return id in this.data ? this.data[id] : 1;
    }
    getSheet(x) {
        return this.sheets[x];
    }
};
