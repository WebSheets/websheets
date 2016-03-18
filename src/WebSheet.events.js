import {DRAG_HANDLE, DRAG_MOVE, DRAG_NONE} from './constants';
import {getCellID, getCellPos, parseExpression as parse} from 'websheets-core';
import {listen, unlisten} from './utils/events';


export function unbindEvents(self) {
    unlisten(self.elem, 'focus');
    unlisten(self.elem, 'blur');
    unlisten(self.elem, 'keyup');
    unlisten(self.elem, 'keydown');
    unlisten(self.elem, 'mousedown');
    unlisten(self.elem, 'mouseup');
    unlisten(self.elem, 'mouseover');
};
export function initEvents(self) {
    unbindEvents(self);
    const {elem} = self;
    listen(elem, 'focus', onFocus.bind(self));
    listen(elem, 'blur', onBlur.bind(self));
    listen(elem, 'keyup', onKeyup.bind(self));
    listen(elem, 'keydown', onKeydown.bind(self));

    listen(elem, 'mousedown', onMousedown.bind(self));
    listen(elem, 'mouseup', onMouseup.bind(self));
    listen(elem, 'mouseover', onMouseover.bind(self));
};

export function onFocus(e) {
    const row = e.target.getAttribute('data-row') | 0;
    const col = e.target.getAttribute('data-col') | 0;
    e.target.value = (this.data[row] || [])[col] || '';
    e.target.select(0, e.target.value.length);
    e.target.parentNode.className = 'websheet-cell-wrapper websheet-has-focus';
};
export function onBlur(e) {
    const row = e.target.getAttribute('data-row') | 0;
    const col = e.target.getAttribute('data-col') | 0;
    this.setValueAtPosition(row, col, e.target.value);
    if (this.calculated[row] && col in this.calculated[row]) {
        e.target.value = this.formatValue(
            getCellID(row, col),
            this.calculated[row][col]
        );
    }
    e.target.parentNode.className = 'websheet-cell-wrapper';
};
export function onKeydown(e) {
    var next;
    if (e.keyCode === 37 && e.target.selectionStart === 0) {
        next = this.getCell(e.target.getAttribute('data-id-prev-col'));
    } else if (e.keyCode === 39 && e.target.selectionEnd === e.target.value.length) {
        next = this.getCell(e.target.getAttribute('data-id-next-col'));
    }
    if (next) {
        next.focus();
        e.preventDefault();
    }
};
export function onKeyup(e) {
    var next;
    if (e.keyCode === 13 || e.keyCode === 40) {
        next = this.getCell(e.target.getAttribute('data-id-next-row'));
    } else if (e.keyCode === 38) {
        next = this.getCell(e.target.getAttribute('data-id-prev-row'));
    }
    if (next) {
        next.focus();
    }
};
export function onMousedown(e) {
    const {target} = e;
    if (!target.classList.contains('websheet-has-focus')) {
        return;
    }

    e.preventDefault();

    const id = this.dragSource = target.firstChild.getAttribute('data-id');
    const pos = getCellPos(id);

    // Assign the value of the currently focused cell's input to the cell, just
    // incase it changed and hasn't been updated on the blur event.
    this.setValueAtPosition(pos.row, pos.col, target.firstChild.value);
    if (e.layerX > target.clientWidth - 10 && e.layerY > target.clientHeight - 10) {
        // this.data[pos.row] = this.data[pos.row] || [];
        // this.data[pos.row][pos.col] = target.value;
        this.dragType = DRAG_HANDLE;
        return;
    }

    this.dragType = DRAG_MOVE;
    this.elem.className += ' websheet-grabbing';
};
export function onMouseup(e) {
    const {target} = e;

    if (this.dragType !== DRAG_NONE &&
        target.classList.contains('websheet-cell')) {

        let pos = getCellPos(this.dragSource);
        let pos2 = getCellPos(target.getAttribute('data-id'));

        if (this.dragType === DRAG_MOVE) {
            this.setValueAtPosition(pos2.row, pos2.col, this.getValueAtPos(pos.row, pos.col) || '');
            this.clearCell(pos.row, pos.col);
            e.target.focus();

        } else if (this.dragType === DRAG_HANDLE && (pos.row === pos2.row || pos.col === pos2.col)) {
            const rawSource = this.getValueAtPos(pos.row, pos.col) || '';
            const parsedSource = rawSource[0] === '=' && parse(rawSource.substr(1));

            if (pos.row === pos2.row) {
                let min = Math.min(pos.col, pos2.col);
                for (let i = min; i <= Math.max(pos.col, pos2.col); i++) {
                    if (i === pos.col) continue;
                    if (parsedSource) {
                        let tmp = parsedSource.clone();
                        tmp.adjust(0, i - min);
                        this.setValueAtPosition(pos.row, i, '=' + tmp.toString());
                    } else {
                        this.setValueAtPosition(pos.row, i, rawSource);
                    }
                }

            } else if (pos.col === pos2.col) {
                const min = Math.min(pos.row, pos2.row);
                for (let i = min; i <= Math.max(pos.row, pos2.row); i++) {
                    if (i === pos.row) continue;
                    if (parsedSource) {
                        let tmp = parsedSource.clone();
                        tmp.adjust(i - min, 0);
                        this.setValueAtPosition(i, pos.col, '=' + tmp.toString());
                    } else {
                        this.setValueAtPosition(i, pos.col, rawSource);
                    }
                }

            } else {
                console.error('Cannot drag handle diagonally');
            }
        }
    }
    this.elem.className = 'websheet';
    this.dragType = DRAG_NONE;
    this.dragSource = null;

    const existing = this.elem.querySelectorAll('.websheet-cell-hover');
    for (let i = 0; i < existing.length; i++) {
        existing[i].classList.remove('websheet-cell-hover');
    }
};
export function onMouseover(e) {
    if (this.dragType === DRAG_NONE) return;
    if (!e.target.classList.contains('websheet-cell')) return;

    const toRemoveClassFrom = [];

    const existing = this.elem.querySelectorAll('.websheet-cell-hover');
    for (let i = 0; i < existing.length; i++) {
        toRemoveClassFrom.push(existing[i].firstChild.dataset.id);
    }

    const targetID = e.target.dataset.id;
    if (targetID === this.dragSource) {
        return;
    }

    if (this.dragType === DRAG_HANDLE) {
        const destPos = getCellPos(targetID);
        const srcPos = getCellPos(this.dragSource);
        if (destPos.col === srcPos.col) {
            for (let i = Math.min(srcPos.row, destPos.row); i <= Math.max(srcPos.row, destPos.row); i++) {
                const tmp = getCellID(i, srcPos.col);
                const trcfTmp = toRemoveClassFrom.indexOf(tmp);
                if (trcfTmp !== -1) {
                    toRemoveClassFrom.splice(trcfTmp, 1);
                } else {
                    this.getCell(tmp).parentNode.classList.add('websheet-cell-hover');
                }
            }
        } else if (destPos.row === srcPos.row) {
            for (let i = Math.min(srcPos.col, destPos.col); i <= Math.max(srcPos.col, destPos.col); i++) {
                const tmp = getCellID(srcPos.row, i);
                const trcfTmp = toRemoveClassFrom.indexOf(tmp);
                if (trcfTmp !== -1) {
                    toRemoveClassFrom.splice(trcfTmp, 1);
                } else {
                    this.getCell(tmp).parentNode.classList.add('websheet-cell-hover');
                }
            }
        }
    } else {
        e.target.parentNode.classList.add('websheet-cell-hover');
    }

    toRemoveClassFrom.forEach(id => {
        this.getCell(id).parentNode.classList.remove('websheet-cell-hover');
    });
};
