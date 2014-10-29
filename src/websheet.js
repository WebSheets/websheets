(function(window, document) {

///////////
// Constants
///////////

var DEFAULT_COLUMN_WIDTH = 100; // px
var DEFAULT_BORDER_WIDTH = 1; // px

var TOKEN_BOOL = /^(true|false)/i;
var TOKEN_STRING = /^"([^\\]|\\.)*"/i;
var TOKEN_CELL_ID = /^(\$?)(\w+)(\$?)(\d+)/i;
var TOKEN_NUM = /^\-?((([1-9][0-9]*\.|0\.)[0-9]+)|([1-9][0-9]*)|0)/;
var TOKEN_BINOP_TIMES = /^(\/|\*|\^)/;
var TOKEN_BINOP_ADD = /^(\+|\-|&)/;
var TOKEN_BINOP_COMP = /^(<>|=|>=|<=|<|>)/;
var TOKEN_FOPEN = /^(\w+)\(/;
var TOKEN_RPAREN = /^\)/;
var TOKEN_LPAREN = /^\(/;
var TOKEN_COMMA = /^,/;
var TOKEN_COLON = /^:/;
var TOKEN_PERCENT = /^%/;
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

function isNaN(x) {
    return window.isNaN(x);
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

    elem.addEventListener(event, cb, elem !== window);
}
function unlisten(elem, event) {
    if (!elem.listeners || !elem.listeners[event]) return;
    elem.listeners[event].forEach(function(listener) {
        elem.removeEventListener(event, listener, elem !== window);
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

function Emitter() {
    var listeners = {};

    this.fire = function(name, arg) {
        var results = [];
        var result;
        var i;
        if (name in listeners) {
            for (i = 0; i < listeners[name].length; i++) {
                result = listeners[name][i].call(null, arg);
                if (result) results.push(result);
            }
        }
        return results;
    };
    var on = this.on = function(name, listener) {
        if (!(name in listeners)) {
            listeners[name] = [];
        }
        listeners[name].push(listener);
    };

    this.endpoint = function(obj) {
        obj = obj || {};
        obj.on = on;
        return obj;
    };
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
    for (var i in params) {
        this[i] = params[i];
    }
}

ExpressionNode.prototype.walk = function(cb) {
    cb(this);
    switch (this.type) {
        case 'range':
            this.start.walk(cb);
            this.end.walk(cb);
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
        case 'binop_expon':
            this.left.walk(cb);
            this.right.walk(cb);
    }
};

ExpressionNode.prototype.toString = function() {
    switch (this.type) {
        case 'boolean': return this.value ? 'true' : 'false';
        case 'string': return JSON.stringify(this.value);
        case 'number': return this.raw.toString();
        case 'identifier': return this.raw.toUpperCase();
        case 'range': return this.start.toString() + ':' + this.end.toString();
        case 'function': return this.name + '(' + this.args.map(function(a) {return a.toString();}).join(',') + ')';
        case 'binop_mult': return this.left.toString() + '*' + this.right.toString();
        case 'binop_div': return this.left.toString() + '/' + this.right.toString();
        case 'binop_add': return this.left.toString() + '+' + this.right.toString();
        case 'binop_sub': return this.left.toString() + '-' + this.right.toString();
        case 'binop_concat': return this.left.toString() + '&' + this.right.toString();
        case 'binop_expon': return this.left.toString() + '^' + this.right.toString();
    }
};

ExpressionNode.prototype.clone = function() {
    switch (this.type) {
        case 'boolean':
        case 'string':
            return new ExpressionNode(this.type, {value: this.value});
        case 'number':
            return new ExpressionNode(this.type, {value: this.value, raw: this.raw});
        case 'identifier':
            return new ExpressionNode(this.type, {value: this.value, pinRow: this.pinRow, pinCol: this.pinCol, raw: this.raw});
        case 'range': return new ExpressionNode(this.type, {start: this.start.clone(), end: this.end.clone()});
        case 'function': return new ExpressionNode(this.type, {name: this.name, args: this.args.map(function(arg) {return arg.clone();})});
        case 'binop_mult':
        case 'binop_div':
        case 'binop_add':
        case 'binop_sub':
        case 'binop_concat':
        case 'binop_expon':
            return new ExpressionNode(this.type, {left: this.left.clone(), right: this.right.clone()});
    }
};

ExpressionNode.prototype.adjust = function(deltaRow, deltaCol) {
    this.walk(function(x) {
        if (x.type !== 'identifier') return;
        var pos = getCellPos(x.value);
        var row = pos.row + (x.pinRow ? 0 : deltaRow);
        var col = pos.col + (x.pinCol ? 0 : deltaCol);
        x.value = getCellID(row, col);
        var rematched = TOKEN_CELL_ID.exec(x.value);
        x.raw = (x.pinCol ? '$' : '') + rematched[2] + (x.pinRow ? '$' : '') + rematched[4];
    });
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
        case 'string':
            return this.value;
        case 'identifier': return parseNumMaybe(sheet.getCalculatedValueAtID(this.value)) || 0;
        case 'binop_mult': return this.left.run(sheet) * this.right.run(sheet);
        case 'binop_div': return this.left.run(sheet) / this.right.run(sheet);
        case 'binop_add': return parseFloat(this.left.run(sheet)) + parseFloat(this.right.run(sheet));
        case 'binop_sub': return this.left.run(sheet) - this.right.run(sheet);
        case 'binop_concat': return this.left.run(sheet).toString() + this.right.run(sheet).toString();
        case 'binop_expon': return Math.pow(this.left.run(sheet), this.right.run(sheet));
        case 'binop_comp_lt': return parseFloat(this.left.run(sheet)) < parseFloat(this.right.run(sheet));
        case 'binop_comp_lte': return parseFloat(this.left.run(sheet)) <= parseFloat(this.right.run(sheet));
        case 'binop_comp_gt': return parseFloat(this.left.run(sheet)) > parseFloat(this.right.run(sheet));
        case 'binop_comp_gte': return parseFloat(this.left.run(sheet)) >= parseFloat(this.right.run(sheet));
        case 'binop_comp_eq': return this.left.run(sheet) == this.right.run(sheet);
        case 'binop_comp_neq': return this.left.run(sheet) != this.right.run(sheet);
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
        } else if (matches = TOKEN_STRING.exec(remainder)) {
            output = new ExpressionToken('string', JSON.parse(matches[0]));
        } else if (matches = TOKEN_NUM.exec(remainder)) {
            output = new ExpressionToken('number', matches[0]);
        } else if (matches = TOKEN_CELL_ID.exec(remainder)) {
            output = new ExpressionToken('ident', matches[0].toUpperCase());
        } else if (matches = TOKEN_FOPEN.exec(remainder)) {
            output = new ExpressionToken('funcopen', matches[1]);
        } else if (matches = TOKEN_RPAREN.exec(remainder)) {
            output = new ExpressionToken('rparen', ')');
        } else if (matches = TOKEN_LPAREN.exec(remainder)) {
            output = new ExpressionToken('lparen', '(');
        } else if (matches = TOKEN_BINOP_TIMES.exec(remainder)) {
            output = new ExpressionToken('binop_times', matches[0]);
        } else if (matches = TOKEN_BINOP_ADD.exec(remainder)) {
            output = new ExpressionToken('binop_add', matches[0]);
        } else if (matches = TOKEN_BINOP_COMP.exec(remainder)) {
            output = new ExpressionToken('binop_comp', matches[0]);
        } else if (matches = TOKEN_COMMA.exec(remainder)) {
            output = new ExpressionToken('comma', ',');
        } else if (matches = TOKEN_PERCENT.exec(remainder)) {
            output = new ExpressionToken('percent', '%');
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
    function assert(type) {
        var popped = pop();
        if (popped.type !== type) throw new SyntaxError('Expected ' + type + ', got ' + popped.type);
        return popped;
    }

    function parsePrimitive() {
        var accepted;
        if (accepted = accept('boolean')) {
            return new ExpressionNode('boolean', {value: accepted.value === 'true'});
        } else if (accepted = accept('number')) {
            var raw = accepted.value;
            var tmp = parseFloat(accepted.value);
            if (accept('percent')) {
                raw += '%';
                tmp /= 100;
            }
            return new ExpressionNode('number', {value: tmp, raw: raw});
        } else if (accepted = accept('string')) {
            return new ExpressionNode('string', {value: accepted.value});
        } else if (accepted = accept('ident')) {
            var rematched = TOKEN_CELL_ID.exec(accepted.value);
            return new ExpressionNode('identifier', {
                value: rematched[2] + rematched[4],
                pinRow: rematched[3] === '$',
                pinCol: rematched[1] === '$',
                raw: accepted.value,
            });
        } else {
            throw new SyntaxError('Unrecognized primitive value');
        }
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
            return parseRange();
        }
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
    function parseParen() {
        if (!accept('lparen')) {
            return parseFunc();
        }
        var output = parseExpression();
        assert('rparen');
        return output;
    }
    function parseTimesBinop() {
        var lval = parseParen();
        var peeked = accept('binop_times');
        if (!peeked) {
            return lval;
        }
        return new ExpressionNode(
            peeked.value === '*' ? 'binop_mult' :
                (peeked.value === '/' ? 'binop_div' : 'binop_expon'), {
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
    function parseCompBinop() {
        var lval = parseTimesBinop();
        var peeked = accept('binop_comp');
        if (!peeked) {
            return lval;
        }
        var name;
        switch (peeked.value) {
            case '<': name = 'binop_comp_lt'; break;
            case '<=': name = 'binop_comp_lte'; break;
            case '>': name = 'binop_comp_gt'; break;
            case '>=': name = 'binop_comp_gte'; break;
            case '=': name = 'binop_comp_eq'; break;
            case '<>': name = 'binop_comp_neq'; break;
        }
        return new ExpressionNode(
            name,
            {
                left: lval,
                operator: peeked.value,
                right: parseCompBinop(),
            }
        );
    }
    function parseExpression() {
        return parseCompBinop();
    }

    return parseExpression();

}


///////////
// Sheets
///////////

var DRAG_NONE = 0;
var DRAG_MOVE = 1;
var DRAG_HANDLE = 2;

var defaultParams = {
    width: 5,
    height: 20,
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

    var me = this;
    listen(window, 'mouseup', this._windowMouseup = function(e) {
        if (me.dragType !== DRAG_NONE) {
            me.dragType = DRAG_NONE;
            me.dragSource = null;
            me.elem.className = 'websheet';
        }
    });

    this.valueUpdates = new Emitter();
    this.calculatedUpdates = new Emitter();
}

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

    unlisten(this.elem, 'mousedown');
    listen(this.elem, 'mousedown', this.onMousedown.bind(this));
    unlisten(this.elem, 'mouseup');
    listen(this.elem, 'mouseup', this.onMouseup.bind(this));
    unlisten(this.elem, 'mouseover');
    listen(this.elem, 'mouseover', this.onMouseover.bind(this));

    workQueue.forEach(function(x) {x();});
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
            var i;
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
    for (var i = 0; i < existing.length; i++) {
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

WebSheet.prototype.clearDependants = function(id) {
    var deps = this.dependants[id];
    if (!deps) return;
    var remDeps;
    var idx;
    for (var i = 0; i < deps.length; i++) {
        remDeps = this.dependencies[deps[i]];
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
    var deps = this.dependencies[cellID];
    if (!deps) return;

    var dep;

    if (this.depUpdateQueue) {
        for (var i = 0; i < deps.length; i++) {
            if (this.depUpdateQueue.indexOf(deps[i]) !== -1) continue;
            this.depUpdateQueue.push(deps[i]);
        }
        return;
    }

    this.depUpdateQueue = deps.concat([]); // Make a copy
    for (var i = 0; i < deps.length; i++) {
        this.depUpdateQueue.push(deps[i]);
    }

    while (this.depUpdateQueue.length) {
        dep = getCellPos(this.depUpdateQueue.shift());
        this.calculateValueAtPosition(dep.row, dep.col, this.data[dep.row][dep.col].substr(1));
    }

    this.depUpdateQueue = null;
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
    if (!expression) return
    var cellID = getCellID(row, col);

    // Parse the expression
    var parsed = parse(expression);

    // Evaluate the expression to find a value
    var value;
    try {
        value = parsed.run(this);
        if (window.isNaN(value)) value = '#VALUE!';
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
    if (parsed) parsed.findCellDependencies(function(dep) {
        if (dependants.indexOf(dep) !== -1) return;
        dependants.push(dep);
        var deps;
        if (!(dep in this.dependencies)) {
            this.dependencies[dep] = [cellID];
        } else if ((deps = this.dependencies[dep]) && deps.indexOf(cellID) === -1) {
            deps.push(cellID);
        }
    }.bind(this));
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

var cellPosCache = {};
function getCellPos(id) {
    if (id in cellPosCache) return cellPosCache[id];
    var matches = /^([a-z]+)([0-9]+)$/i.exec(id);
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
    cellPosCache[id] = output;
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
