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
var TOKEN_BINOP_ADD = /^(\+|\-)/;
var TOKEN_FOPEN = /^(\w+)\(/;
var TOKEN_RPAREN = /^\)/;
var TOKEN_COMMA = /^,/;
var TOKEN_WS = /^\s+/;

///////////
// Utils
///////////

function factorial(n, modifier) {
    return n < 2 ? return n : return n * factorial(n - (modifier || 1));
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

function sum(elems) {
    return elems.reduce(function(a, b) {
        return a + b;
    }, 0);
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

ExpressionNode.prototype.run = function(sheet) {
    switch (this.type) {
        case 'boolean':
        case 'number':
            return this.value;
        case 'identifier':
            return sheet.getCalculatedValueAtID(this.value);
        case 'binop_mult':
            return this.left.run(sheet) * this.right.run(sheet);
        case 'binop_div':
            return this.left.run(sheet) / this.right.run(sheet);
        case 'binop_add':
            return this.left.run(sheet) + this.right.run(sheet);
        case 'binop_sub':
            return this.left.run(sheet) - this.right.run(sheet);
    }
    if (this.type !== 'function') throw new TypeError('Unknown exression node');
    var args = this.args.map(function(arg) {
        return arg.run(sheet);
    });
    switch (this.name.toLowerCase()) {
        case 'sin': return Math.sin(args[0]);
        case 'cos': return Math.cos(args[0]);
        case 'tan': return Math.tan(args[0]);
        case 'int':
        case 'floor': return Math.floor(args[0]);
        case 'ceiling':
        case 'ceil': return Math.ceil(args[0]);
        case 'iseven': return args[0] % 2 === 0;
        case 'isodd': return args[0] % 2 !== 0;
        case 'istext': return typeof args[0] === 'string';
        case 'isnottext': return typeof args[0] !== 'string';
        case 'isnumber': return typeof args[0] === 'number';
        case 'and': return args.reduce(function(a, b) {return a && b;});
        case 'or': return args.reduce(function(a, b) {return a || b;});
        case 'if': return args[0] ? args[1] : args[2];
        case 'not': return !args[0];
        case 'abs': return Math.abs(args[0]);
        case 'acos': return Math.acos(args[0]);
        case 'acosh': return Math.acosh(args[0]);
        case 'asin': return Math.asin(args[0]);
        case 'asinh': return Math.asinh(args[0]);
        case 'atan': return Math.atan(args[0]);
        case 'atanh': return Math.atanh(args[0]);
        case 'atan2': return Math.atan2(args[0]);
        case 'combin': return factorial(args[0]) / factorial(args[0] - args[1]);
        case 'degrees': return args[0] * 57.2957795;
        case 'even': return Math.ceil(args[0] / 2) * 2;
        case 'exp': return Math.exp(args[0], args[1]);
        case 'fact': return factorial(args[0]);
        case 'factdouble': return factorial(args[0], 2);
        case 'ln': return Math.log(args[0]);
        case 'log10': return Math.log10(args[0]);
        case 'mod': return args[0] % args[1];
        case 'pi': return Math.PI;
        case 'power': return Math.pow(args[0], args[1]);
        case 'product': return args.reduce(function(a, b) {return a * b;});
        case 'quotient': return args[0] / args[1] | 0;
        case 'radians': return args[0] / 57.2957795;
        case 'rand': return Math.random();
        case 'randbetween': return Math.random() * (args[1] - args[0]) + args[0];
        case 'round': return Math.round(args[0] * Math.pow(10, args[1])) / Math.pow(10, args[1]);
        case 'rounddown': return args[0] < 0 ? Math.ceil(args[0]) : Math.floor(args[0]);
        case 'roundup': return args[0] > 0 ? Math.ceil(args[0]) : Math.floor(args[0]);
        case 'sign': return args[0] / Math.abs(args[0]) || 0;
        case 'sqrt': return Math.sqrt(args[0]);
        case 'sqrtpi': return Math.sqrt(args[0] * Math.PI);
        case 'sum': return args.reduce(function(a, b) {return a + b;});
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
            output = new ExpressionToken('ident', matches[0]);
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
        } else {
            throw new SyntaxError();
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
    function parseFunc() {
        var funcName = accept('funcopen');
        if (!funcName) {
            return parsePrimitive();
        }
        var peeked = peek();
        var args = [];
        while (peek()) {
            if (accept('rparen')) break;
            if (args.length) assert('comma');
            args.push(parseExpression());
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
        return new ExpressionNode(peeked.value === '+' ? 'binop_add' : 'binop_sub', {
            left: lval,
            operator: peeked.value,
            right: parseAddBinop(),
        });
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
    height: 500,
};

function WebSheet(elem, params) {
    this.elem = elem;

    params = defaults(params || {}, defaultParams);
    extend(this, params);

    this.columnWidths = [];
    for (var i = 0; i < params.width; i++) {
        this.columnWidths[i] = DEFAULT_COLUMN_WIDTH;
    }

    this.rowElemCache = [];

    this.data = [];
    this.calculated = [];
    this.formatting = [];
}

WebSheet.prototype.forceRerender = function() {
    // First, update the element to be the correct dimensions.
    var width = sum(this.columnWidths); // Get the width of each column
    width -= (this.width) * DEFAULT_BORDER_WIDTH; // Account for border widths
    this.elem.style.width = width + 'px';

    while (this.elem.childNodes.length) {
        this.elem.removeChild(this.elem.firstChild);
    }

    // Clear internal node caches.
    this.rowElemCache = [];

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
        this.rowElemCache.push(row);
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
            cell.setAttribute('data-id', cell.title = this.getCellID(i, j));
            cell.setAttribute('data-id-next-row', this.getCellID(i + 1, j));
            cell.setAttribute('data-row', i);
            cell.setAttribute('data-col', j);

            cellFormatting = rowFormattingCache[j];
            if (!cellFormatting) continue;
            for (cellFormattingStyle in cellFormatting) {
                if (!cellFormatting.hasOwnProperty(cellFormattingStyle)) continue;
                cell.style[cellFormattingStyle] = cellFormatting[cellFormattingStyle];
            }

        }
    }

    // Bind event handlers
    unlisten(this.elem, 'blur');
    listen(this.elem, 'blur', this.onBlur.bind(this));
    unlisten(this.elem, 'keyup');
    listen(this.elem, 'keyup', this.onKeyup.bind(this));
};

WebSheet.prototype.onBlur = function(e) {
    var row = e.target.getAttribute('data-row') | 0;
    var col = e.target.getAttribute('data-col') | 0;
    this.setValueAtPosition(row, col, e.target.value);
};
WebSheet.prototype.onKeyup = function(e) {
    if (e.keyCode === 13) {
        var next = this.elem.querySelector('[data-id=' + e.target.getAttribute('data-id-next-row') + ']');
        if (next) next.focus();
    }
};

WebSheet.prototype.getCalculatedValueAtID = function(id) {
    var pos = this.getCellPos(id);
    return (this.calculated[pos.row] || [])[pos.col] || (this.data[pos.row] || [])[pos.col];
};

WebSheet.prototype.setValueAtPosition = function(row, col, value) {
    this.data[row] = this.data[row] || [];
    this.data[row][col] = value;
    if (this.calculated[row]) {
        delete this.calculated[row][col];
    }

    if (value[0] === '=') {
        this.calculateValueAtPosition(row, col, value.substr(1));
    }
};

WebSheet.prototype.calculateValueAtPosition = function(row, col, expression) {
    if (!expression) return;
    var parsed = parse(expression);
    console.log(parsed);
    var value = parsed.run(this);
};

WebSheet.prototype.getCellID = function(row, column) {
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
};

WebSheet.prototype.getCellPos = function(id) {
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
    return {col: col, row: matches[2] - 1};
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


if (window.define) {
    window.define('websheet', function() {
        return WebSheet;
    });
} else {
    window.WebSheet = WebSheet;
}

}(window, document));
