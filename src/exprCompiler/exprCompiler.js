var TOKEN_BOOL = /^(true|false)/i;
var TOKEN_STRING = /^"([^\\]|\\.)*"/i;
var TOKEN_CELL_ID = /^(\$?)(\w+)(\$?)(\d+)/i;
var TOKEN_NUM = /^\-?((([1-9][0-9]*\.|0\.)[0-9]+)|([1-9][0-9]*)|0)/;
var TOKEN_BINOP_TIMES = /^(\/|\*|\^)/;
var TOKEN_BINOP_ADD = /^(\+|\-|&)/;
var TOKEN_BINOP_COMP = /^(<>|=|>=|<=|<|>)/;
var TOKEN_FOPEN = /^(\w+)\(/;
var TOKEN_XSOPEN = /^(\w+)!/;
var TOKEN_RPAREN = /^\)/;
var TOKEN_LPAREN = /^\(/;
var TOKEN_COMMA = /^,/;
var TOKEN_COLON = /^:/;
var TOKEN_PERCENT = /^%/;
var TOKEN_WS = /^\s+/;


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
        } else if (matches = TOKEN_FOPEN.exec(remainder)) {
            output = new ExpressionToken('funcopen', matches[1]);
        } else if (matches = TOKEN_XSOPEN.exec(remainder)) {
            output = new ExpressionToken('sheetref', matches[1]);
        } else if (matches = TOKEN_CELL_ID.exec(remainder)) {
            output = new ExpressionToken('ident', matches[0].toUpperCase());
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
    function parseSheetRef() {
        var sheetref = accept('sheetref');
        if (!sheetref) {
            return parseFunc();
        }
        return new ExpressionNode('sheetlookup', {
            sheet: sheetref.value,
            content: parseRange(),
        });
    }
    function parseParen() {
        if (!accept('lparen')) {
            return parseSheetRef();
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
        var lval = parseAddBinop();
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
