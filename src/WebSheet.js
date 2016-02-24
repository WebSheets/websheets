import {DRAG_NONE} from './constants';
import Emitter from './Emitter';
import {getCellID, getCellPos} from './utils/cellID';
import {initEvents} from './WebSheet.events';
import {listen} from './utils/events';
import parseExpression from './exprCompiler';
import {parseNumMaybe} from './exprCompiler/functions';


const DEFAULT_COLUMN_WIDTH = 100; // px
const DEFAULT_BORDER_WIDTH = 1; // px

const defaultParams = {
    width: 6,
    height: 6,
    noBrowser: false,
};


const WINDOW_MOUSEUP = Symbol('window.onmouseup');

export default class WebSheet {
    constructor(elem, params = {}) {
        this.elem = elem;
        this.elem.className = 'websheet';

        Object.assign(this, defaultParams, params);

        this.columnWidths = [];
        for (let i = 0; i < params.width; i++) {
            this.columnWidths[i] = DEFAULT_COLUMN_WIDTH;
        }

        this.data = [];
        this.calculated = [];
        this.formatting = [];

        this.depUpdateQueue = null;
        this.dependencies = {}; // Map of cell ID to array of dependant cell IDs
        this.dependants = {}; // Map of cell ID to array of dependencies

        this.cellCache = {};

        this.dragType = DRAG_NONE;
        this.dragSource = null;

        this.valueUpdates = new Emitter();
        this.calculatedUpdates = new Emitter();

        this.context = params.context || null;
        this.name = null;

        if (params.noBrowser) {
            return;
        }

        listen(window, 'mouseup', this[WINDOW_MOUSEUP] = e => {
            if (this.dragType === DRAG_NONE) {
                return;
            }
            this.dragType = DRAG_NONE;
            this.dragSource = null;
            this.elem.className = 'websheet';
        });
    }

    addColumn() {
        this.width += 1;
        this.columnWidths.push(DEFAULT_COLUMN_WIDTH);
        this.forceRerender();
    }
    addRow() {
        this.height += 1;
        this.data.push(new Array(this.width));
        this.calculated.push(new Array(this.width));
        this.formatting.push(new Array(this.width));
        this.forceRerender();
    }

    calculateValueAtPosition(row, col, expression) {
        if (!expression) return;
        var cellID = getCellID(row, col);

        // Parse the expression
        var parsed = parseExpression(expression);

        // Evaluate the expression to find a value
        var value;
        try {
            value = parsed.run(this);
            if (isNaN(value)) value = '#VALUE!';
        } catch (e) {
            throw e;
            console.error(e);
            value = '#ERROR!';
            parsed = null;
        }

        // Set the calculated value in the calculated cache
        this.calculated[row] = this.calculated[row] || [];

        var wasUpdated = this.calculated[row][col] !== value;
        if (wasUpdated) {
            this.calculated[row][col] = value;
        }

        // Set the dependants
        var dependants = [];
        if (parsed) {
            // Bind intra-sheet dependencies
            parsed.findCellDependencies(dep => {
                if (dependants.indexOf(dep) !== -1) return;
                dependants.push(dep);
                var deps;
                if (!(dep in this.dependencies)) {
                    this.dependencies[dep] = [cellID];
                } else if ((deps = this.dependencies[dep]) && deps.indexOf(cellID) === -1) {
                    deps.push(cellID);
                }
            });

            // Bind inter-sheet dependencies if a sheet context exists
            if (this.context) {
                this.context.clearDependencies(this, cellID);
                let sheetDeps = [];
                parsed.findSheetDependencies((sheet, dep) => {
                    if (!this.context.sheets[sheet.toUpperCase()]) return;
                    var depName = `${sheet}!${dep}`;
                    if (sheetDeps.indexOf(depName) !== -1) return;
                    sheetDeps.push(depName);

                    this.context.setDependency(this, cellID, sheet, dep, () => {
                        this.calculateValueAtPosition(row, col, expression);
                    });

                });
            }

        }
        this.dependants[cellID] = dependants;

        // Set the value of the element
        const elem = this.getCell(cellID);
        if (elem) elem.value = value;

        if (wasUpdated) {
            this.updateDependencies(cellID);
            this.calculatedUpdates.fire(cellID, value);
        }
    }

    clearCell(row, col) {
        const cellID = getCellID(row, col);
        if (row in this.data) delete this.data[row][col];
        if (row in this.calculated) delete this.calculated[row][col];
        this.clearDependants(cellID);
        this.dependants[cellID] = [];

        const elem = this.getCell(cellID);
        if (elem) {
            elem.value = '';
        }
    }

    clearDependants(id) {
        var deps = this.dependants[id];
        if (!deps) return;

        for (var i = 0; i < deps.length; i++) {
            let remDeps = this.dependencies[deps[i]];
            if (!remDeps) continue;
            let idx = remDeps.indexOf(id);
            if (idx !== -1) remDeps.splice(idx, 1);
        }

        if (!this.context) return;
        this.context.clearDependencies(this, id);
    }

    forceRerender() {
        if (this.noBrowser) {
            return;
        }

        // First, update the element to be the correct dimensions.
        var width = this.columnWidths.reduce((a, b) => a + b); // Get the width of each column
        width += DEFAULT_BORDER_WIDTH;
        // width -= this.width * DEFAULT_BORDER_WIDTH; // Account for border widths
        this.elem.style.width = width + 'px';

        while (this.elem.childNodes.length) {
            this.elem.removeChild(this.elem.firstChild);
        }
        this.cellCache = {};

        var workQueue = [];

        // Create each row and cell
        for (var i = 0; i < this.height; i++) {
            let row = document.createElement('div');
            row.style.width = width + 'px';
            row.className = 'websheet-row';
            if (i < 1) {
                row.className += ' websheet-row-sticky';
            }
            this.elem.appendChild(row);

            let rowDataCache = this.data[i] || [];
            let rowCalculatedCache = this.calculated[i] || [];
            let rowFormattingCache = this.formatting[i] || [];

            for (var j = 0; j < this.width; j++) {
                let cell = document.createElement('input');
                cell.className = 'websheet-cell';

                let cellWrapper = document.createElement('div');
                cellWrapper.className = 'websheet-cell-wrapper';
                cellWrapper.style.width = (this.columnWidths[j] - 1) + 'px';
                cellWrapper.appendChild(cell);

                row.appendChild(cellWrapper);

                cell.value = rowCalculatedCache[j] || rowDataCache[j] || '';
                cell.setAttribute('data-id', cell.title = getCellID(i, j));
                cell.setAttribute('data-id-prev-col', getCellID(i, j - 1));
                cell.setAttribute('data-id-prev-row', getCellID(i - 1, j));
                cell.setAttribute('data-id-next-col', getCellID(i, j + 1));
                cell.setAttribute('data-id-next-row', getCellID(i + 1, j));
                cell.setAttribute('data-row', i);
                cell.setAttribute('data-col', j);

                if (cell.value[0] === '=') {
                    workQueue.push(
                        this.setValueAtPosition.bind(this, i, j, cell.value, true)
                    );
                }

                let cellFormatting = rowFormattingCache[j];
                if (!cellFormatting) continue;
                for (let cellFormattingStyle in cellFormatting) {
                    if (!cellFormatting.hasOwnProperty(cellFormattingStyle)) continue;
                    cell.style[cellFormattingStyle] = cellFormatting[cellFormattingStyle];
                }

            }
        }

        // Bind event handlers
        initEvents(this);

        workQueue.forEach(task => task());
    }

    getCalculatedValueAtID(id) {
        const {row, col} = getCellPos(id);
        return this.getCalculatedValueAtPos(row, col);
    }

    getCalculatedValueAtPos(row, col) {
        return parseNumMaybe(
            (this.calculated[row] || [])[col] ||
            (this.data[row] || [])[col] ||
            0
        );
    }

    getCell(id) {
        if (this.noBrowser) return null;
        if (id in this.cellCache) return this.cellCache[id];
        return this.cellCache[id] = this.elem.querySelector(`[data-id="${id}"]`);
    }

    getSheet(name) {
        if (!this.context) throw new Error('No context to extract sheet from');
        name = name.toUpperCase();
        if (!(name in this.context.sheets)) throw new Error('Undefined sheet requested');
        return this.context.sheets[name];
    }

    getValueAtPos(row, col) {
        return (this.data[row] || [])[col] || null;
    }

    insertColumnBefore(idx) {
        this.width += 1;
        this.columnWidths.splice(idx, 0, DEFAULT_COLUMN_WIDTH);
        for (var i = 0; i < this.height; i++) {
            if (this.data[i]) this.data[i].splice(idx, 0, null);
            if (this.calculated[i]) this.calculated[i].splice(idx, 0, null);
            if (this.formatting[i]) this.formatting[i].splice(idx, 0, null);
        }
        this.forceRerender();
    }
    insertRowBefore(idx) {
        this.height += 1;
        this.data.splice(idx, 0, new Array(this.width));
        this.calculated.splice(idx, 0, new Array(this.width));
        this.formatting.splice(idx, 0, new Array(this.width));
        this.forceRerender();
    }

    loadData(data) {
        while (this.height < data.length) this.addRow();
        while (this.width < data[0].length) this.addColumn();

        for (var i = 0; i < data.length; i++) {
            this.data[i] = this.data[i] || [];
            for (var j = 0; j < data[i].length; j++) {
                this.setValueAtPosition(i, j, data[i][j], true);
            }
        }
        this.forceRerender();
    }

    popColumn() {
        if (this.width < 2) throw new Error('Cannot make spreadsheet that small');
        this.width -= 1;
        this.columnWidths.pop();
        for (var i = 0; i < this.height; i++) {
            if (this.data[i] && this.data[i].length > this.width) this.data[i].pop();
            if (this.calculated[i] && this.calculated[i].length > this.width) this.calculated[i].pop();
            if (this.formatting[i] && this.formatting[i].length > this.width) this.formatting[i].pop();
        }
        this.forceRerender();
    }
    popRow() {
        if (this.height < 2) throw new Error('Cannot make spreadsheet that small');
        this.height -= 1;
        this.data.pop();
        this.calculated.pop();
        this.formatting.pop();
        this.forceRerender();
    }

    removeColumn(idx) {
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
    }
    removeRow(i) {
        if (this.height < 2) throw new Error('Cannot make spreadsheet that small');
        if (i < 0 || i >= this.width) throw new Error('Removing cells that do not exist');
        this.height -= 1;
        this.data.splice(i, 1);
        this.calculated.splice(i, 1);
        this.formatting.splice(i, 1);
        this.forceRerender();
    }

    setValueAtPosition(row, col, value, force = false) {
        const cellID = getCellID(row, col);

        this.data[row] = this.data[row] || [];
        if (this.data[row][col] === value && !force) {
            return;
        }

        this.data[row][col] = value;
        if (this.calculated[row]) {
            delete this.calculated[row][col];
        }

        this.clearDependants(cellID);

        this.valueUpdates.fire(cellID, value);

        if (value[0] === '=') {
            this.calculateValueAtPosition(row, col, value.substr(1));
        } else {
            this.updateDependencies(cellID);
            const elem = this.getCell(cellID);
            if (elem) elem.value = value;
        }
    }

    updateDependencies(cellID) {
        var deps = this.dependencies[cellID];
        if (!deps) return;

        if (this.depUpdateQueue) {
            for (let i = 0; i < deps.length; i++) {
                if (this.depUpdateQueue.indexOf(deps[i]) !== -1) continue;
                this.depUpdateQueue.push(deps[i]);
            }
            return;
        }

        this.depUpdateQueue = deps.concat([]); // Make a copy
        for (let i = 0; i < deps.length; i++) {
            this.depUpdateQueue.push(deps[i]);
        }

        while (this.depUpdateQueue.length) {
            let {row, col} = getCellPos(this.depUpdateQueue.shift());
            this.calculateValueAtPosition(row, col, this.data[row][col].substr(1));
        }

        this.depUpdateQueue = null;
    }
};
