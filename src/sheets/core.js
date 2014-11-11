var DEFAULT_COLUMN_WIDTH = 100; // px
var DEFAULT_BORDER_WIDTH = 1; // px

var DRAG_NONE = 0;
var DRAG_MOVE = 1;
var DRAG_HANDLE = 2;

var defaultParams = {
    width: 6,
    height: 6,
};

function WebSheet(elem, params) {
    this.elem = elem;
    this.elem.className = 'websheet';

    params = defaults(params || {}, defaultParams);
    extend(this, params);

    this.columnWidths = [];
    for (var i = 0; i < params.width; i++) {
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

    listen(window, 'mouseup', this._windowMouseup = function(e) {
        if (this.dragType !== DRAG_NONE) {
            this.dragType = DRAG_NONE;
            this.dragSource = null;
            this.elem.className = 'websheet';
        }
    }.bind(this));

    this.valueUpdates = new Emitter();
    this.calculatedUpdates = new Emitter();

    this.context = params.context || null;
    this.name = null;
}

WebSheet.prototype.getSheet = function(name) {
    if (!this.context) throw new Error('No context to extract sheet from');
    name = name.toUpperCase();
    if (!(name in this.context.sheets)) throw new Error('Undefined sheet requested');
    return this.context.sheets[name];
};

WebSheet.prototype.getCell = function(id) {
    if (id in this.cellCache) return this.cellCache[id];
    return this.cellCache[id] = this.elem.querySelector('[data-id="' + id + '"]');
};

WebSheet.prototype.forceRerender = function() {
    // First, update the element to be the correct dimensions.
    var width = sum(this.columnWidths); // Get the width of each column
    width += DEFAULT_BORDER_WIDTH;
    // width -= this.width * DEFAULT_BORDER_WIDTH; // Account for border widths
    this.elem.style.width = width + 'px';

    while (this.elem.childNodes.length) {
        this.elem.removeChild(this.elem.firstChild);
    }
    this.cellCache = {};

    var workQueue = [];

    // Create each row and cell
    var row;
    var rowDataCache;
    var rowCalculatedCache;
    var rowFormattingCache;
    var cell;
    var cellWrapper;
    var cellFormatting;
    var cellFormattingStyle;
    for (var i = 0; i < this.height; i++) {
        row = document.createElement('div');
        row.style.width = width + 'px';
        row.className = 'websheet-row';
        if (i < 1) {
            row.className += ' websheet-row-sticky';
        }
        this.elem.appendChild(row);

        rowDataCache = this.data[i] || [];
        rowCalculatedCache = this.calculated[i] || [];
        rowFormattingCache = this.formatting[i] || [];

        for (var j = 0; j < this.width; j++) {
            cell = document.createElement('input');
            cell.className = 'websheet-cell';

            cellWrapper = document.createElement('div');
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
                workQueue.push(this.setValueAtPosition.bind(this, i, j, cell.value, true));
            }

            cellFormatting = rowFormattingCache[j];
            if (!cellFormatting) continue;
            for (cellFormattingStyle in cellFormatting) {
                if (!cellFormatting.hasOwnProperty(cellFormattingStyle)) continue;
                cell.style[cellFormattingStyle] = cellFormatting[cellFormattingStyle];
            }

        }
    }

    // Bind event handlers
    this.initEvents();

    workQueue.forEach(function(x) {x();});
};

WebSheet.prototype.getCalculatedValueAtID = function(id) {
    var pos = getCellPos(id);
    return this.getCalculatedValueAtPos(pos.row, pos.col);
};

WebSheet.prototype.getCalculatedValueAtPos = function(row, col) {
    return parseNumMaybe((this.calculated[row] || [])[col] || (this.data[row] || [])[col] || 0);
};

WebSheet.prototype.getValueAtPos = function(row, col) {
    return (this.data[row] || [])[col] || null;
};

WebSheet.prototype.setValueAtPosition = function(row, col, value, force) {
    var cellID = getCellID(row, col);
    var elem = this.getCell(cellID);

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
        if (elem) elem.value = value;
    }
};

WebSheet.prototype.calculateValueAtPosition = function(row, col, expression) {
    if (!expression) return;
    var cellID = getCellID(row, col);

    // Parse the expression
    var parsed = parse(expression);

    // Evaluate the expression to find a value
    var value;
    try {
        value = parsed.run(this);
        if (isNaN(value)) value = '#VALUE!';
    } catch (e) {
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
        parsed.findCellDependencies(function(dep) {
            if (dependants.indexOf(dep) !== -1) return;
            dependants.push(dep);
            var deps;
            if (!(dep in this.dependencies)) {
                this.dependencies[dep] = [cellID];
            } else if ((deps = this.dependencies[dep]) && deps.indexOf(cellID) === -1) {
                deps.push(cellID);
            }
        }.bind(this));

        // Bind inter-sheet dependencies if a sheet context exists
        if (this.context) {
            this.context.clearDependencies(this, cellID);
            var sheetDeps = [];
            parsed.findSheetDependencies(function(sheet, dep) {
                if (!this.context.sheets[sheet.toUpperCase()]) return;
                var depName = sheet + '!' + dep;
                if (sheetDeps.indexOf(depName) !== -1) return;
                sheetDeps.push(depName);

                this.context.setDependency(this, cellID, sheet, dep, function() {
                    this.calculateValueAtPosition(row, col, expression);
                }.bind(this));

            }.bind(this));
        }

    }
    this.dependants[cellID] = dependants;

    // Set the value of the element
    this.getCell(cellID).value = value;

    if (wasUpdated) {
        this.updateDependencies(cellID);
        this.calculatedUpdates.fire(cellID, value);
    }
};

WebSheet.prototype.clearCell = function(row, col) {
    var cellID = getCellID(row, col);
    var elem = this.getCell(cellID);
    if (!elem) return;

    elem.value = '';
    if (row in this.data) delete this.data[row][col];
    if (row in this.calculated) delete this.calculated[row][col];
    this.clearDependants(cellID);
    this.dependants[cellID] = [];
};

WebSheet.prototype.loadData = function(data) {
    while (this.height < data.length) this.addRow();
    while (this.width < data[0].length) this.addColumn();

    for (var i = 0; i < data.length; i++) {
        this.data[i] = this.data[i] || [];
        for (var j = 0; j < data[i].length; j++) {
            this.data[i][j] = data[i][j];
        }
    }
    this.forceRerender();
};

WebSheet.parseExpression = function(expr) {
    return parse(expr);
};
