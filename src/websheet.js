(function(window, document) {

///////////
// Constants
///////////

var DEFAULT_COLUMN_WIDTH = 100; // px
var DEFAULT_BORDER_WIDTH = 1; // px

var TOKEN_BOOL = /^(true|false)/i;
var TOKEN_CELL_ID = /^\w+\d+/i;
var TOKEN_NUM = /^(([1-9][0-9]*\.[0-9]+)|([1-9][0-9]*))/;
var TOKEN_BINOP_TIMES = /^(\/|\*)/;
var TOKEN_BINOP_ADD = /^(\+|\-|&)/;
var TOKEN_FOPEN = /^(\w+)\(/;
var TOKEN_RPAREN = /^\)/;
var TOKEN_COMMA = /^,/;
var TOKEN_COLON = /^:/;
var TOKEN_WS = /^\s+/;

///////////
// Utils
///////////

function ident(x) {
    return x;
}

function factorial(n, modifier) {
    return n < 2 ? n : n * factorial(n - (modifier || 1));
}

function extend(base, extension) {
    extension = extension || {};
    for (var i in extension) {
        if (!extension.hasOwnProperty(i)) continue;
        base[i] = extension[i];
    }
    return base;
}

function defaults(base, def) {
    for (var i in def) {
        if (!def.hasOwnProperty(i)) continue;
        base[i] = base[i] || def[i];
    }
    return base;
}

function add(a, b) {
    return a + b;
}

function sum(elems) {
    return elems.reduce(function(a, b) {
        return a + b;
    }, 0);
}

function commas(num) {
    return num.toString().split(/(?=(?:\d\d\d)*$)/).join(',');
}

function listen(elem, event, cb) {
    elem.listeners = elem.listeners || {};
    elem.listeners[event] = elem.listeners[event] || [];
    elem.listeners[event].push(cb);

    elem.addEventListener(event, cb, true);
}
function unlisten(elem, event) {
    if (!elem.listeners || !elem.listeners[event]) return;
    elem.listeners[event].forEach(function(listener) {
        elem.removeEventListener(event, listener, true);
    });
}

function isNaNAsFloat(value) {
    return window.isNaN(parseFloat(value));
}

function isNotNaNAsFloat(value) {
    return !window.isNaN(parseFloat(value));
}

function parseNumMaybe(value) {
    var parsed = parseFloat(value);
    return window.isNaN(parsed) ? value : parsed;
}

function parseNumAlways(value) {
    var parsed = parseFloat(value);
    return window.isNaN(parsed) ? (value ? 1 : 0) : parsed;
}

///////////
// Expression Parser
///////////

function ExpressionToken(type, value) {
    this.type = type;
    this.value = value;
}

function ExpressionNode(type, params) {
    this.type = type;
    extend(this, params);
}

ExpressionNode.prototype.walk = function(cb) {
    cb(this);
    switch (this.type) {
        case 'boolean':
        case 'number':
        case 'identifier':
            return;
        case 'function':
            this.args.forEach(function(arg) {
                arg.walk(cb);
            });
            return;
        case 'binop_mult':
        case 'binop_div':
        case 'binop_add':
        case 'binop_sub':
        case 'binop_concat':
            this.left.walk(cb);
            this.right.walk(cb);
    }
};

function iterateRangeNode(node, cb) {
    var start = getCellPos(node.start.value);
    var end = getCellPos(node.end.value);
    var rowStart = Math.min(start.row, end.row);
    var rowEnd = Math.max(start.row, end.row);
    var colStart = Math.min(start.col, end.col);
    var colEnd = Math.max(start.col, end.col);
    for (var i = rowStart; i <= rowEnd; i++) {
        for (var j = colStart; j <= colEnd; j++) {
            cb(i, j);
        }
    }
}

ExpressionNode.prototype.findCellDependencies = function(cb) {
    this.walk(function(node) {
        if (node.type === 'identifier') {
            cb(node.value);
        } else if (node.type === 'range') {
            iterateRangeNode(node, function(row, col) {
                cb(getCellID(row, col));
            });
        }
    });
};

ExpressionNode.prototype.run = function(sheet) {
    switch (this.type) {
        case 'boolean':
        case 'number':
            return this.value;
        case 'identifier':
            return parseNumMaybe(sheet.getCalculatedValueAtID(this.value)) || 0;
        case 'binop_mult':
            return this.left.run(sheet) * this.right.run(sheet);
        case 'binop_div':
            return this.left.run(sheet) / this.right.run(sheet);
        case 'binop_add':
            return this.left.run(sheet) + this.right.run(sheet);
        case 'binop_sub':
            return this.left.run(sheet) - this.right.run(sheet);
        case 'binop_concat':
            return this.left.run(sheet).toString() + this.right.run(sheet).toString();
        case 'range':
            var rangeCells = [];
            iterateRangeNode(this, function(row, col) {
                rangeCells.push(parseNumMaybe(sheet.getCalculatedValueAtPos(row, col)));
            });
            return rangeCells;
    }
    if (this.type !== 'function') throw new TypeError('Unknown exression node');

    var args = [];
    var argTmp;
    for (var argI = 0; argI < this.args.length; argI++) {
        argTmp = this.args[argI].run(sheet);
        if (argTmp && typeof argTmp === 'object') {
            args = args.concat(argTmp);
        } else {
            args.push(argTmp);
        }
    }
    var tmp;
    var tmp2;
    switch (this.name.toLowerCase()) {
        case 'abs': return Math.abs(args[0]);
        case 'acos': return Math.acos(args[0]);
        case 'acosh': return Math.acosh(args[0]);
        case 'and': return args.reduce(function(a, b) {return a && b;});
        case 'average':
            tmp = args.filter(isNotNaNAsFloat);
            return tmp.length ? tmp.reduce(add) / tmp.length : 0;
        case 'averagea':
            return args.map(parseNumAlways).reduce(add) / args.length;
        case 'code':
        case 'asc': return args[0].toString().charCodeAt(0) || 0;
        case 'asin': return Math.asin(args[0]);
        case 'asinh': return Math.asinh(args[0]);
        case 'atan': return Math.atan(args[0]);
        case 'atan2': return Math.atan2(args[0]);
        case 'atanh': return Math.atanh(args[0]);
        case 'ceil':
        case 'ceiling': return Math.ceil(args[0]);
        case 'chr':
        case 'char': return String.fromCharCode(args[0]);
        case 'combin': return factorial(args[0]) / factorial(args[0] - args[1]);
        case 'concatenate': return args.reduce(function(a, b) {return a.toString() + b.toString();});
        case 'cos': return Math.cos(args[0]);
        case 'count': return args.filter(isNotNaNAsFloat).length;
        case 'counta': return args.filter(function(x) {return x !== '' && x !== null && x !== undefined;}).length;
        case 'countblank': return args.filter(function(x) {return x === '';}).length;
        case 'countif': return args.filter(function(x) {return x == args[1];}).length;
        case 'degrees': return args[0] * 57.2957795;
        case 'dollar': return '$' + commas(args[0] | 0) + (args[1] ? '.' + parseFloat(args[0]).toFixed(args[1]).split('.')[1] : '');
        case 'even': return Math.ceil(args[0] / 2) * 2;
        case 'exact': return args[0].toString() === args[1].toString();
        case 'exp': return Math.exp(args[0], args[1]);
        case 'fact': return factorial(args[0]);
        case 'factdouble': return factorial(args[0], 2);
        case 'search':
        case 'find': return args[1].toString().substr((args[2] || 1) - 1).indexOf(args[0].toString());
        case 'fixed': return (args[2] ? ident : commas)(args[0]) + (args[1] ? '.' + parseFloat(args[0]).toFixed(args[1]).split('.')[1] : '');
        case 'int':
        case 'floor': return Math.floor(args[0]);
        case 'frequency': return args.slice(0, -1).filter(function(x) {return x <= args[args.length - 1];}).length;
        case 'if': return args[0] ? args[1] : args[2];
        case 'isblank': return args[0] === '' || args[0] === null;
        case 'iseven': return args[0] % 2 === 0;
        case 'isnottext': return typeof args[0] !== 'string';
        case 'isnumber': return typeof args[0] === 'number';
        case 'isodd': return args[0] % 2 !== 0;
        case 'istext': return typeof args[0] === 'string';
        case 'large': return args.slice(0, -1).sort().reverse()[args[args.length - 1]];
        case 'lower':
        case 'lcase': return args[0].toString().toLowerCase();
        case 'left': return args[0].toString().substr(0, args[1] || 1);
        case 'len': return args[0].toString().length;
        case 'ln': return Math.log(args[0]);
        case 'log10': return Math.log10(args[0]);
        case 'max': return Math.max.apply(Math, args.filter(isNotNaNAsFloat));
        case 'maxa': return Math.max.apply(Math, args.map(parseNumAlways));
        case 'median':
            tmp = args.map(parseFloat).sort();
            return tmp.length % 2 === 0 ? (tmp[(tmp.length - 1) / 2 | 0] + tmp[Math.ceil((tmp.length - 1) / 2)]) / 2 : tmp[(tmp.length - 1) / 2];
        case 'mid': return args[0].toString().substr((args[1] || 1) - 1, args[2]);
        case 'min': return Math.min.apply(Math, args.filter(isNotNaNAsFloat));
        case 'mina': return Math.min.apply(Math, args.map(parseNumAlways));
        case 'mod': return args[0] % args[1];
        case 'not': return !args[0];
        case 'or': return args.reduce(function(a, b) {return a || b;});
        case 'pi': return Math.PI;
        case 'power': return Math.pow(args[0], args[1]);
        case 'product': return args.reduce(function(a, b) {return a * b;});
        case 'proper': return args[0].toString().split(/\s/).map(function(s) {return s[0].toUpperCase() + s.substr(1);});
        case 'quotient': return args[0] / args[1] | 0;
        case 'radians': return args[0] / 57.2957795;
        case 'rand': return Math.random();
        case 'randbetween': return Math.random() * (args[1] - args[0]) + args[0];
        case 'replace': return args[0].toString().substr(0, args[1] - 1) + args[3].toString() + args[0].toString().substr(args[1] - 1 + args[2]);
        case 'rept': return (new Array(args[1] + 1)).join(args[0].toString());
        case 'right': return args[0].toString().substr(-1 * args[1] || -1);
        case 'round': return Math.round(args[0] || 0).toFixed(args[1] || 0);
        case 'fix':
        case 'rounddown': return args[0] < 0 ? Math.ceil(args[0]) : Math.floor(args[0]);
        case 'roundup': return args[0] > 0 ? Math.ceil(args[0]) : Math.floor(args[0]);
        case 'sign': return args[0] / Math.abs(args[0]) || 0;
        case 'sin': return Math.sin(args[0]);
        case 'space': return (new Array(args[0] + 1)).join(' ');
        case 'sqrt': return Math.sqrt(args[0]);
        case 'sqrtpi': return Math.sqrt(args[0] * Math.PI);
        case 'stdev':
            tmp = args.filter(isNotNaNAsFloat).map(parseNumAlways);
            tmp2 = tmp.reduce(add) / tmp.length;
            return Math.sqrt(tmp.map(function(x) {return Math.pow(x - tmp2, 2);}).reduce(add) / (tmp.length - 1));
        case 'stdeva':
            tmp = args.map(parseNumAlways);
            tmp2 = tmp.reduce(add) / tmp.length;
            return Math.sqrt(tmp.map(function(x) {return Math.pow(x - tmp2, 2);}).reduce(add) / (tmp.length - 1));
        case 'stdevp':
            tmp = args.filter(isNotNaNAsFloat).map(parseNumAlways);
            tmp2 = tmp.reduce(add) / tmp.length;
            return Math.sqrt(tmp.map(function(x) {return Math.pow(x - tmp2, 2);}).reduce(add) / tmp.length);
        case 'stdevpa':
            tmp = args.map(parseNumAlways);
            tmp2 = tmp.reduce(add) / tmp.length;
            return Math.sqrt(tmp.map(function(x) {return Math.pow(x - tmp2, 2);}).reduce(add) / tmp.length);
        case 't':
        case 'str': return args[0].toString();
        case 'sum': return args.map(parseNumAlways).reduce(add);
        case 'tan': return Math.tan(args[0]);
        case 'upper':
        case 'ucase': return args[0].toString().toUpperCase();
        case 'value':
        case 'val': return (/^\d+/.exec(args[0].toString().replace(/\s/g, '')) || [''])[0];
        case 'var':
            tmp = args.filter(isNotNaNAsFloat).map(parseNumAlways);
            tmp2 = tmp.reduce(add) / tmp.length;
            return tmp.map(function(x) {return Math.pow(x - tmp2, 2);}).reduce(add) / (tmp.length - 1);
        case 'vara':
            tmp = args.map(parseNumAlways);
            tmp2 = tmp.reduce(add) / tmp.length;
            return tmp.map(function(x) {return Math.pow(x - tmp2, 2);}).reduce(add) / (tmp.length - 1);
        case 'varp':
            tmp = args.filter(isNotNaNAsFloat).map(parseNumAlways);
            tmp2 = tmp.reduce(add) / tmp.length;
            return tmp.map(function(x) {return Math.pow(x - tmp2, 2);}).reduce(add) / tmp.length;
        case 'varpa':
            tmp = args.map(parseNumAlways);
            tmp2 = tmp.reduce(add) / tmp.length;
            return tmp.map(function(x) {return Math.pow(x - tmp2, 2);}).reduce(add) / tmp.length;
    }
};

function parse(expression) {
    var lexIdx = 0;
    function lex() {
        var remainder = expression.substr(lexIdx);
        if (!remainder) return 'EOF';
        var matches;
        var output;
        if (matches = TOKEN_WS.exec(remainder)) {
            lexIdx += matches[0].length;
            return lex();
        } else if (matches = TOKEN_BOOL.exec(remainder)) {
            output = new ExpressionToken('boolean', matches[0].toLowerCase());
        } else if (matches = TOKEN_NUM.exec(remainder)) {
            output = new ExpressionToken('number', matches[0]);
        } else if (matches = TOKEN_CELL_ID.exec(remainder)) {
            output = new ExpressionToken('ident', matches[0].toUpperCase());
        } else if (matches = TOKEN_FOPEN.exec(remainder)) {
            output = new ExpressionToken('funcopen', matches[1]);
        } else if (matches = TOKEN_RPAREN.exec(remainder)) {
            output = new ExpressionToken('rparen', ')');
        } else if (matches = TOKEN_BINOP_TIMES.exec(remainder)) {
            output = new ExpressionToken('binop_times', matches[0]);
        } else if (matches = TOKEN_BINOP_ADD.exec(remainder)) {
            output = new ExpressionToken('binop_add', matches[0]);
        } else if (matches = TOKEN_COMMA.exec(remainder)) {
            output = new ExpressionToken('comma', ',');
        } else if (matches = TOKEN_COLON.exec(remainder)) {
            output = new ExpressionToken('colon', ':');
        } else {
            throw new SyntaxError('Unknown token: ' + remainder);
        }
        if (matches) {
            lexIdx += matches[0].length;
        }
        return output;
    }

    var peeked;
    function peek() {
        return peeked = peeked || lex();
    }
    function pop() {
        var output = peeked || lex();
        peeked = null;
        return output;
    }
    function accept(type) {
        var peeked = peek();
        if (!peeked || peeked.type !== type) return null;
        return pop();
    }
    function assert(types) {
        var popped = pop();
        if (types.indexOf(popped.type) === -1) throw new SyntaxError();
        return popped;
    }

    function parsePrimitive() {
        var accepted;
        if (accepted = accept('boolean'))
            return new ExpressionNode('boolean', {value: accepted.value === 'true'});
        else if (accepted = accept('number'))
            return new ExpressionNode('number', {value: parseFloat(accepted.value)});
        else if (accepted = accept('ident'))
            return new ExpressionNode('identifier', {value: accepted.value});
        else
            throw new SyntaxError();
    }
    function parseRange() {
        var base = parsePrimitive();
        if (!base || base.type !== 'identifier') return base;
        if (accept('colon')) {
            var end = assert('ident');
            base = new ExpressionNode('range', {
                start: base,
                end: new ExpressionNode('identifier', {value: end.value})
            });
        }
        return base;
    }
    function parseFunc() {
        var funcName = accept('funcopen');
        if (!funcName) {
            return parsePrimitive();
        }
        var args = [];
        while (peek()) {
            if (accept('rparen')) break;
            if (args.length) assert('comma');
            args.push(parseRange());
        }
        return new ExpressionNode('function', {
            name: funcName.value,
            args: args,
        });
    }
    function parseTimesBinop() {
        var lval = parseFunc();
        var peeked = accept('binop_times');
        if (!peeked) {
            return lval;
        }
        return new ExpressionNode(peeked.value === '*' ? 'binop_mult' : 'binop_div', {
            left: lval,
            operator: peeked.value,
            right: parseTimesBinop(),
        });
    }
    function parseAddBinop() {
        var lval = parseTimesBinop();
        var peeked = accept('binop_add');
        if (!peeked) {
            return lval;
        }
        return new ExpressionNode(
            peeked.value === '+' ? 'binop_add' :
                (peeked.value === '&' ? 'binop_concat' : 'binop_sub'),
            {
                left: lval,
                operator: peeked.value,
                right: parseAddBinop(),
            }
        );
    }
    function parseExpression() {
        return parseAddBinop();
    }

    return parseExpression();

}


///////////
// Sheets
///////////

var defaultParams = {
    width: 5,
    height: 20,
};

function WebSheet(elem, params) {
    this.elem = elem;

    params = defaults(params || {}, defaultParams);
    extend(this, params);

    this.columnWidths = [];
    for (var i = 0; i < params.width; i++) {
        this.columnWidths[i] = DEFAULT_COLUMN_WIDTH;
    }

    this.data = [];
    this.calculated = [];
    this.formatting = [];

    this.depStack = [];
    this.dependencies = new Map(); // Map of cell ID to array of dependant cell IDs
    this.dependants = new Map(); // Map of cell ID to array of dependencies
}

WebSheet.prototype.forceRerender = function() {
    // First, update the element to be the correct dimensions.
    var width = sum(this.columnWidths); // Get the width of each column
    width -= (this.width) * DEFAULT_BORDER_WIDTH; // Account for border widths
    this.elem.style.width = width + 'px';

    while (this.elem.childNodes.length) {
        this.elem.removeChild(this.elem.firstChild);
    }

    var workQueue = [];

    // Create each row and cell
    var row;
    var rowDataCache;
    var rowCalculatedCache;
    var rowFormattingCache;
    var cell;
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
            cell.style.width = this.columnWidths[j] + 'px';
            row.appendChild(cell);
            cell.value = rowCalculatedCache[j] || rowDataCache[j] || '';
            cell.setAttribute('data-id', cell.title = getCellID(i, j));
            cell.setAttribute('data-id-prev-col', getCellID(i, j - 1));
            cell.setAttribute('data-id-prev-row', getCellID(i - 1, j));
            cell.setAttribute('data-id-next-col', getCellID(i, j + 1));
            cell.setAttribute('data-id-next-row', getCellID(i + 1, j));
            cell.setAttribute('data-row', i);
            cell.setAttribute('data-col', j);

            if (cell.value[0] === '=') {
                workQueue.push(function(cell, i, j) {
                    this.setValueAtPosition(i, j, cell.value, true);
                }.bind(this, cell, i, j));
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
    unlisten(this.elem, 'focus');
    listen(this.elem, 'focus', this.onFocus.bind(this));
    unlisten(this.elem, 'blur');
    listen(this.elem, 'blur', this.onBlur.bind(this));
    unlisten(this.elem, 'keyup');
    listen(this.elem, 'keyup', this.onKeyup.bind(this));
    unlisten(this.elem, 'keydown');
    listen(this.elem, 'keydown', this.onKeydown.bind(this));

    workQueue.forEach(function(x) {x();});
};

WebSheet.prototype.onFocus = function(e) {
    var row = e.target.getAttribute('data-row') | 0;
    var col = e.target.getAttribute('data-col') | 0;
    e.target.value = (this.data[row] || [])[col] || '';
    e.target.select(0, e.target.value.length);
};
WebSheet.prototype.onBlur = function(e) {
    var row = e.target.getAttribute('data-row') | 0;
    var col = e.target.getAttribute('data-col') | 0;
    this.setValueAtPosition(row, col, e.target.value);
};
WebSheet.prototype.onKeydown = function(e) {
    var next;
    if (e.keyCode === 37 && e.target.selectionStart === 0) {
        next = this.elem.querySelector('[data-id="' + e.target.getAttribute('data-id-prev-col') + '"]');
    } else if (e.keyCode === 39 && e.target.selectionEnd === e.target.value.length) {
        next = this.elem.querySelector('[data-id="' + e.target.getAttribute('data-id-next-col') + '"]');
    }
    if (next) {
        next.focus();
        e.preventDefault();
    }
};
WebSheet.prototype.onKeyup = function(e) {
    var next;
    if (e.keyCode === 13 || e.keyCode === 40) {
        next = this.elem.querySelector('[data-id="' + e.target.getAttribute('data-id-next-row') + '"]');
    } else if (e.keyCode === 38) {
        next = this.elem.querySelector('[data-id="' + e.target.getAttribute('data-id-prev-row') + '"]');
    }
    if (next) next.focus();
};

WebSheet.prototype.clearDependants = function(id) {
    var deps = this.dependants.get(id);
    if (!deps) return;
    var remDeps;
    var idx;
    for (var i = 0; i < deps.length; i++) {
        remDeps = this.dependencies.get(deps[i]);
        if (!remDeps) continue;
        idx = remDeps.indexOf(id);
        if (idx !== -1) remDeps.splice(idx, 1);
    }
};

WebSheet.prototype.getCalculatedValueAtID = function(id) {
    var pos = getCellPos(id);
    return this.getCalculatedValueAtPos(pos.row, pos.col);
};

WebSheet.prototype.getCalculatedValueAtPos = function(row, col) {
    return (this.calculated[row] || [])[col] || (this.data[row] || [])[col];
};

WebSheet.prototype.updateDependencies = function(cellID) {
    if (this.depStack.indexOf(cellID) !== -1) return;
    this.depStack.push(cellID);
    var deps = this.dependencies.get(cellID);
    if (deps) {
        var dep;
        for (var i = 0; i < deps.length; i++) {
            dep = getCellPos(deps[i]);
            this.calculateValueAtPosition(dep.row, dep.col, this.data[dep.row][dep.col].substr(1));
        }
    }
    this.depStack.pop();
};

WebSheet.prototype.setValueAtPosition = function(row, col, value, force) {
    var cellID = getCellID(row, col);

    this.data[row] = this.data[row] || [];
    if (this.data[row][col] === value && !force) {
        var elem = this.elem.querySelector('[data-id="' + cellID + '"]');
        if (elem && this.calculated[row] && this.calculated[row][col]) elem.value = this.calculated[row][col];
        return;
    }

    this.data[row][col] = value;
    if (this.calculated[row]) {
        delete this.calculated[row][col];
    }

    this.clearDependants(cellID);

    if (value[0] === '=') {
        this.calculateValueAtPosition(row, col, value.substr(1));
    } else {
        this.updateDependencies(cellID);
    }
};

WebSheet.prototype.calculateValueAtPosition = function(row, col, expression) {
    if (!expression) return
    var cellID = getCellID(row, col);

    // Parse the expression
    var parsed = parse(expression);
    console.log(parsed);

    // Evaluate the expression to find a value
    var value;
    try {
        value = parsed.run(this);
    } catch (e) {
        console.error(e);
        value = '#ERROR';
    }
    console.log(value);

    // Set the calculated value in the calculated cache
    this.calculated[row] = this.calculated[row] || [];
    this.calculated[row][col] = value;

    // Set the dependants
    var dependants = [];
    parsed.findCellDependencies(function(dep) {
        if (dependants.indexOf(dep) !== -1) return;
        dependants.push(dep);
        var deps;
        if (!this.dependencies.has(dep)) {
            this.dependencies.set(dep, [cellID]);
        } else if ((deps = this.dependencies.get(dep)) && deps.indexOf(cellID) === -1) {
            deps.push(cellID);
        }
    }.bind(this));
    this.dependants.set(cellID, dependants);

    // Set the value of the element
    this.elem.querySelector('[data-id=' + cellID + ']').value = value;

    this.updateDependencies(cellID);
};

WebSheet.prototype.clearCell = function(row, col) {
    var cellID = getCellID(row, col);
    var elem = this.elem.querySelector('[data-id="' + cellID + '"]');
    if (!elem) return;

    elem.value = '';
    if (row in this.data) delete this.data[row][col];
    if (row in this.calculated) delete this.calculated[row][col];
    this.clearDependants(cellID);
    this.dependants.set(cellID, []);
};

WebSheet.prototype.addColumn = function() {
    this.width += 1;
    this.columnWidths.push(DEFAULT_COLUMN_WIDTH);
    this.forceRerender();
};

WebSheet.prototype.addRow = function() {
    this.height += 1;
    this.data.push(new Array(this.width));
    this.formatting.push(new Array(this.width));
    this.calculated.push(new Array(this.width));
    this.forceRerender();
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

function getCellID(row, column) {
    var base = '';
    var character;

    row += 1;

    do {
        character = column % 26;
        column -= character;
        column /= 26;
        base = String.fromCharCode(character + 65) + base;
    } while (column);
    return base + row;
}

var cellPosCache = new Map();
function getCellPos(id) {
    if (cellPosCache.has(id)) return cellPosCache.get(id);
    var matches = /(\w+)(\d)+/.exec(id);
    var charBit = matches[1];
    var character;
    var col = 0;
    while (charBit) {
        character = charBit.charCodeAt(0) - 65;
        col *= 26;
        col += character;
        charBit = charBit.substr(1);
    }
    var output = {col: col, row: matches[2] - 1};
    cellPosCache.set(id, output);
    return output;
}


if (window.define) {
    window.define('websheet', function() {
        return WebSheet;
    });
} else {
    window.WebSheet = WebSheet;
}

}(window, document));
