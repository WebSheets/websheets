import WebSheet from 'websheets-core';
import {Emitter, getCellID, getCellPos, parseExpression} from 'websheets-core';

import {DRAG_NONE} from './constants';
import {initEvents, unbindEvents} from './WebSheet.events';
import {listen, unlisten} from './utils/events';


const DEFAULT_COLUMN_WIDTH = 120; // px
const DEFAULT_BORDER_WIDTH = 1; // px

const defaultParams = {
    noBrowser: false,
};


const WINDOW_MOUSEUP = Symbol('window.onmouseup');

export default class BrowserWebSheet extends WebSheet {
    constructor(elem, params = {}) {
        super(Object.assign({}, defaultParams, params));
        this.elem = elem;
        this.elem.className = 'websheet';

        this.columnWidths = [];
        for (let i = 0; i < this.width; i++) {
            this.columnWidths.push(DEFAULT_COLUMN_WIDTH);
        }
        this.cellCache = {};

        this.dragType = DRAG_NONE;
        this.dragSource = null;

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
        unbindEvents(this);
    }

    addColumn(rerender = true) {
        this.columnWidths.push(DEFAULT_COLUMN_WIDTH);
        super.addColumn(rerender);
    }

    calculateValueAtPosition(row, col, expression) {
        const value = super.calculateValueAtPosition(row, col, expression);
        if (typeof value === 'undefined') {
            return;
        }
        const cellID = getCellID(row, col);
        const elem = this.getCell(cellID);
        if (elem) {
            elem.value = this.formatValue(cellID, value);
        }
    }

    clearCell(row, col) {
        super.clearCell(row, col);
        const cellID = getCellID(row, col);
        const elem = this.getCell(cellID);
        if (elem) {
            elem.value = '';
        }
    }

    forceRerender() {
        if (this.noBrowser) {
            return;
        }

        // First, update the element to be the correct dimensions.
        let width = this.columnWidths.reduce((a, b) => a + b); // Get the width of each column
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

    getCell(id) {
        if (this.noBrowser) return null;
        if (id in this.cellCache) return this.cellCache[id];
        return this.cellCache[id] = this.elem.querySelector(`[data-id="${id}"]`);
    }

    insertColumnBefore(idx) {
        this.columnWidths.splice(idx, 0, DEFAULT_COLUMN_WIDTH);
        super.insertColumnBefore(idx);
    }

    popColumn() {
        if (this.width < 2) throw new Error('Cannot make spreadsheet that small');
        this.columnWidths.pop();
        super.popColumn();
    }
    removeColumn(idx) {
        if (this.width < 2) throw new Error('Cannot make spreadsheet that small');
        if (idx < 0 || idx >= this.width) throw new Error('Removing cells that do not exist');
        this.columnWidths.splice(idx, 1);
        super.removeColumn(idx);
    }

    setValueAtPosition(row, col, value, force = false) {
        const updated = super.setValueAtPosition(row, col, value, force);
        if (!updated || value[0] === '=') {
            return;
        }
        const cellID = getCellID(row, col);

        const elem = this.getCell(cellID);
        if (elem) {
            elem.value = this.formatValue(cellID, value);
        }
    }

};
