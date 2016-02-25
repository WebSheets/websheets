import {DRAG_NONE} from './constants';
import Emitter from './Emitter';
import {getCellID, getCellPos} from './utils/cellID';
import {initEvents, unbindEvents} from './WebSheet.events';
import {listen, unlisten} from './utils/events';
import parseExpression from './exprCompiler';
import {parseNumMaybe} from './exprCompiler/functions';


const DEFAULT_COLUMN_WIDTH = 120; // px
const DEFAULT_BORDER_WIDTH = 1; // px

const defaultParams = {
    context: null,
    immutable: false,
    name: null,
    noBrowser: false,

    height: 6,
    width: 6,

    iterate: true,
    maxIterations: 1000,
    iterationEpsilon: 0.001,
};


const WINDOW_MOUSEUP = Symbol('window.onmouseup');

export default class WebSheet {
    constructor(elem, params = {}) {
        this.elem = elem;
        this.elem.className = 'websheet';

        Object.assign(this, defaultParams, params);

        this.columnWidths = [];
        for (let i = 0; i < this.width; i++) {
            this.columnWidths.push(DEFAULT_COLUMN_WIDTH);
        }

        this.data = [];
        this.calculated = [];

        this.calculationSemaphore = {};
        this.depUpdateQueue = null;
        this.dependencies = {}; // Map of cell ID to array of dependant cell IDs
        this.dependants = {}; // Map of cell ID to array of dependencies

        this.cellCache = {};

        this.dragType = DRAG_NONE;
        this.dragSource = null;

        this.valueUpdates = new Emitter();
        this.calculatedUpdates = new Emitter();
        this.console = new Emitter();

        if (this.noBrowser || this.immutable) {
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

    destroy() {
        unlisten(window, 'mouseup', this[WINDOW_MOUSEUP]);
        unbindEvents.call(this);
    }

    addColumn(rerender = true) {
        this.width += 1;
        this.columnWidths.push(DEFAULT_COLUMN_WIDTH);
        if (rerender) {
            this.forceRerender();
        }
    }
    addRow(rerender = true) {
        this.height += 1;
        this.data.push(new Array(this.width));
        this.calculated.push(new Array(this.width));
        if (rerender) {
            this.forceRerender();
        }
    }

    calculateValueAtPosition(row, col, expression) {
        if (!expression) return;
        const cellID = getCellID(row, col);
        var value;
        var doCalculate = true;

        // Do some cycle detection.
        if (cellID in this.calculationSemaphore) {
            if (!this.iterate) {
                this.console.fire('error', 'Cycle detected and aborted because iterate is set to false');
                doCalculate = false;
                value = 0;

            } else if (this.calculationSemaphore[cellID] > this.maxIterations) {
                this.console.fire('warn', 'Circular reference hit max iteration limit');
                value = 0;
            }

            this.calculationSemaphore[cellID]++;

        } else {
            this.calculationSemaphore[cellID] = 1;
        }

        // Parse the expression
        const parsed = parseExpression(expression);

        // Evaluate the expression to find a value
        try {
            // We have a switch to disable calculation in case there is a
            // circular reference and that's banned.
            if (doCalculate) {
                value = parsed.run(this);
            }
        } catch (e) {
            value = new Error('#ERROR!');
        }

        // Set the calculated value in the calculated cache
        this.calculated[row] = this.calculated[row] || [];

        const origCalculatedValue = this.calculated[row][col];
        const wasUpdated = origCalculatedValue !== value;
        if (wasUpdated) {
            this.calculated[row][col] = value;
        }

        // Set the dependants
        const dependants = [];
        if (parsed) {
            // Bind intra-sheet dependencies
            parsed.findCellDependencies(dep => {
                if (dependants.indexOf(dep) !== -1) return;
                dependants.push(dep);
                if (!(dep in this.dependencies)) {
                    this.dependencies[dep] = [cellID];
                    return;
                }

                const deps = this.dependencies[dep];
                if (deps && deps.indexOf(cellID) === -1) {
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
        if (elem) {
            elem.value = this.formatValue(cellID, value);
        }

        if (wasUpdated) {
            this.updateDependencies(cellID);
            this.calculatedUpdates.fire(cellID, value);
        }

        // Clean up the cycle detection semaphore
        this.calculationSemaphore[cellID]--;
        if (!this.calculationSemaphore[cellID]) {
            delete this.calculationSemaphore[cellID];
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
        const deps = this.dependants[id];
        if (!deps) return;

        for (let i = 0; i < deps.length; i++) {
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

        const workQueue = [];

        // Create each row and cell
        for (let i = 0; i < this.height; i++) {
            const row = document.createElement('div');
            row.style.width = `${width}px`;
            row.className = 'websheet-row';
            this.elem.appendChild(row);

            const rowDataCache = this.data[i] || [];
            const rowCalculatedCache = this.calculated[i] || [];

            for (let j = 0; j < this.width; j++) {
                const cellID = getCellID(i, j);

                const cell = document.createElement('input');
                cell.className = 'websheet-cell';
                if (this.immutable) {
                    cell.readOnly = true;
                }

                const cellWrapper = document.createElement('div');
                cellWrapper.className = 'websheet-cell-wrapper';
                cellWrapper.style.width = (this.columnWidths[j] - 1) + 'px';
                cellWrapper.appendChild(cell);

                row.appendChild(cellWrapper);

                let cellValue = null;
                if (j in rowCalculatedCache &&
                        rowCalculatedCache[j] !== null &&
                        typeof rowCalculatedCache[j] !== 'undefined') {
                    cellValue = rowCalculatedCache[j];

                } else if (j in rowDataCache &&
                           rowDataCache[j] !== null &&
                           typeof rowDataCache[j] !== 'undefined') {
                    cellValue = rowDataCache[j];
                }

                if (cellValue !== null) {
                    cell.value = this.formatValue(cellID, cellValue);
                }

                cell.title = cellID;
                cell.setAttribute('data-id', cellID);
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

            }
        }

        if (!this.immutable || this.noBrowser) {
            // Bind event handlers
            initEvents(this);
        }

        workQueue.forEach(task => task());
    }

    formatValue(cellID, value) {
        switch (typeof value) {
            case 'string':
                break; // pass

            case 'number':
                if (value === Infinity || value === -1 * Infinity) {
                    return '#DIV/0!';
                }
                if (isNaN(value)) {
                    return '#VALUE!';
                }
                value = value.toString();
                break;

            case 'boolean':
                value = value ? 'TRUE' : 'FALSE';
                break;

            default:
                if (value instanceof Date) {
                    value = value.toLocaleString();
                    break;
                }
                if (value instanceof Error) {
                    return value.message;
                }
                return '#VALUE!';
        }

        return value;
    }

    getCalculatedValueAtID(id) {
        const {row, col} = getCellPos(id);
        return this.getCalculatedValueAtPos(row, col);
    }

    getCalculatedValueAtPos(row, col) {
        if (row in this.calculated) {
            let data = this.calculated[row][col];
            if (data !== null && typeof data !== 'undefined') {
                return parseNumMaybe(data);
            }
        }
        if (row in this.data) {
            let data = this.data[row][col];
            if (data !== null && typeof data !== 'undefined') {
                return parseNumMaybe(data);
            }
        }

        return 0;
    }

    getCell(id) {
        if (this.noBrowser) return null;
        if (id in this.cellCache) return this.cellCache[id];
        return this.cellCache[id] = this.elem.querySelector(`[data-id="${id}"]`);
    }

    getSheet(name) {
        if (!this.context) {
            throw new Error('No context to extract sheet from');
        }
        name = name.toUpperCase();
        if (!(name in this.context.sheets)) {
            throw new Error('Undefined sheet requested');
        }
        return this.context.sheets[name];
    }

    getValueAtPos(row, col) {
        return (this.data[row] || [])[col] || null;
    }

    insertColumnBefore(idx) {
        this.width += 1;
        this.columnWidths.splice(idx, 0, DEFAULT_COLUMN_WIDTH);
        for (let i = 0; i < this.height; i++) {
            if (this.data[i]) {
                this.data[i].splice(idx, 0, null);
            }
            if (this.calculated[i]) {
                this.calculated[i].splice(idx, 0, null);
            }
        }
        this.forceRerender();
    }
    insertRowBefore(idx) {
        this.height += 1;
        this.data.splice(idx, 0, new Array(this.width));
        this.calculated.splice(idx, 0, new Array(this.width));
        this.forceRerender();
    }

    loadData(data) {
        while (this.height < data.length) this.addRow(false);
        while (this.width < data[0].length) this.addColumn(false);

        for (let i = 0; i < data.length; i++) {
            this.data[i] = this.data[i] || [];
            for (let j = 0; j < data[i].length; j++) {
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
        }
        this.forceRerender();
    }
    popRow() {
        if (this.height < 2) throw new Error('Cannot make spreadsheet that small');
        this.height -= 1;
        this.data.pop();
        this.calculated.pop();
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
        }
        this.forceRerender();
    }
    removeRow(i) {
        if (this.height < 2) throw new Error('Cannot make spreadsheet that small');
        if (i < 0 || i >= this.width) throw new Error('Removing cells that do not exist');

        this.height -= 1;
        this.data.splice(i, 1);
        this.calculated.splice(i, 1);
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
            if (elem) {
                elem.value = this.formatValue(cellID, value);
            }
        }
    }

    updateDependencies(cellID) {
        var deps = this.dependencies[cellID];
        if (!deps) return;

        if (this.depUpdateQueue) {
            for (let i = 0; i < deps.length; i++) {
                if (this.depUpdateQueue.indexOf(deps[i]) !== -1) {
                    continue;
                }
                this.depUpdateQueue.push(deps[i]);
            }
            return;
        }

        this.depUpdateQueue = [...deps]; // Make a copy

        while (this.depUpdateQueue.length) {
            let {row, col} = getCellPos(this.depUpdateQueue.shift());
            this.calculateValueAtPosition(row, col, this.data[row][col].substr(1));
        }

        this.depUpdateQueue = null;
    }
};
