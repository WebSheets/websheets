WebSheet.prototype.initEvents = function() {
    unlisten(this.elem, 'focus');
    listen(this.elem, 'focus', this.onFocus.bind(this));
    unlisten(this.elem, 'blur');
    listen(this.elem, 'blur', this.onBlur.bind(this));
    unlisten(this.elem, 'keyup');
    listen(this.elem, 'keyup', this.onKeyup.bind(this));
    unlisten(this.elem, 'keydown');
    listen(this.elem, 'keydown', this.onKeydown.bind(this));

    unlisten(this.elem, 'mousedown');
    listen(this.elem, 'mousedown', this.onMousedown.bind(this));
    unlisten(this.elem, 'mouseup');
    listen(this.elem, 'mouseup', this.onMouseup.bind(this));
    unlisten(this.elem, 'mouseover');
    listen(this.elem, 'mouseover', this.onMouseover.bind(this));
};

WebSheet.prototype.onFocus = function(e) {
    var row = e.target.getAttribute('data-row') | 0;
    var col = e.target.getAttribute('data-col') | 0;
    e.target.value = (this.data[row] || [])[col] || '';
    e.target.select(0, e.target.value.length);
    e.target.parentNode.className = 'websheet-cell-wrapper websheet-has-focus';
};
WebSheet.prototype.onBlur = function(e) {
    var row = e.target.getAttribute('data-row') | 0;
    var col = e.target.getAttribute('data-col') | 0;
    this.setValueAtPosition(row, col, e.target.value);
    if (this.calculated[row] && col in this.calculated[row]) e.target.value = this.calculated[row][col];
    e.target.parentNode.className = 'websheet-cell-wrapper';
};
WebSheet.prototype.onKeydown = function(e) {
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
WebSheet.prototype.onKeyup = function(e) {
    var next;
    if (e.keyCode === 13 || e.keyCode === 40) {
        next = this.getCell(e.target.getAttribute('data-id-next-row'));
    } else if (e.keyCode === 38) {
        next = this.getCell(e.target.getAttribute('data-id-prev-row'));
    }
    if (next) next.focus();
};
WebSheet.prototype.onMousedown = function(e) {
    var target = e.target;
    var id;
    var pos;
    if (!target.classList.contains('websheet-has-focus')) {
        return;
    }

    e.preventDefault();

    id = this.dragSource = target.firstChild.getAttribute('data-id');
    pos = getCellPos(id);

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
WebSheet.prototype.onMouseup = function(e) {
    var target = e.target;
    var i;
    var pos;
    var pos2;
    if (this.dragType && target.classList.contains('websheet-cell')) {
        pos = getCellPos(this.dragSource);
        pos2 = getCellPos(target.getAttribute('data-id'));


        if (this.dragType === DRAG_MOVE) {
            this.setValueAtPosition(pos2.row, pos2.col, this.getValueAtPos(pos.row, pos.col) || '');
            this.clearCell(pos.row, pos.col);
            e.target.focus();
        } else if (this.dragType === DRAG_HANDLE && (pos.row === pos2.row || pos.col === pos2.col)) {
            var rawSource = this.getValueAtPos(pos.row, pos.col) || '';
            var parsedSource = rawSource[0] === '=' && parse(rawSource.substr(1));
            var tmp;
            var min;
            if (pos.row === pos2.row) {
                min = Math.min(pos.col, pos2.col);
                for (i = min; i <= Math.max(pos.col, pos2.col); i++) {
                    if (i === pos.col) continue;
                    if (parsedSource) {
                        tmp = parsedSource.clone();
                        tmp.adjust(0, i - min);
                        this.setValueAtPosition(pos.row, i, '=' + tmp.toString());
                    } else {
                        this.setValueAtPosition(pos.row, i, rawSource);
                    }
                }
            } else if (pos.col === pos2.col) {
                min = Math.min(pos.row, pos2.row);
                for (i = min; i <= Math.max(pos.row, pos2.row); i++) {
                    if (i === pos.row) continue;
                    if (parsedSource) {
                        tmp = parsedSource.clone();
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
    this.dragType = 0;
    this.dragSource = null;

    var existing = this.elem.querySelectorAll('.websheet-cell-hover');
    for (i = 0; i < existing.length; i++) {
        existing[i].classList.remove('websheet-cell-hover');
    }
};
WebSheet.prototype.onMouseover = function(e) {
    if (!this.dragType) return;
    if (!e.target.classList.contains('websheet-cell')) return;

    var toRemoveClassFrom = [];

    var existing = this.elem.querySelectorAll('.websheet-cell-hover');
    for (var i = 0; i < existing.length; i++) {
        toRemoveClassFrom.push(existing[i].firstChild.dataset.id);
    }

    var targetID = e.target.dataset.id;
    if (targetID === this.dragSource) {
        return;
    }

    if (this.dragType === DRAG_HANDLE) {
        var destPos = getCellPos(targetID);
        var srcPos = getCellPos(this.dragSource);
        var tmp;
        var trcfTmp;
        if (destPos.col === srcPos.col) {
            for (i = Math.min(srcPos.row, destPos.row); i <= Math.max(srcPos.row, destPos.row); i++) {
                tmp = getCellID(i, srcPos.col);
                if ((trcfTmp = toRemoveClassFrom.indexOf(tmp)) !== -1) {
                    toRemoveClassFrom.splice(trcfTmp, 1);
                } else {
                    this.getCell(tmp).parentNode.classList.add('websheet-cell-hover');
                }
            }
        } else if (destPos.row === srcPos.row) {
            for (i = Math.min(srcPos.col, destPos.col); i <= Math.max(srcPos.col, destPos.col); i++) {
                tmp = getCellID(srcPos.row, i);
                if ((trcfTmp = toRemoveClassFrom.indexOf(tmp)) !== -1) {
                    toRemoveClassFrom.splice(trcfTmp, 1);
                } else {
                    this.getCell(tmp).parentNode.classList.add('websheet-cell-hover');
                }
            }
        }
    } else {
        e.target.parentNode.classList.add('websheet-cell-hover');
    }

    toRemoveClassFrom.forEach(function(id) {
        this.getCell(id).parentNode.classList.remove('websheet-cell-hover');
    }, this);
};
