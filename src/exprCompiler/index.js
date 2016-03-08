import ExpressionToken from './ExpressionToken';
import ExpressionNode from './ExpressionNode';


export const TOKEN_BOOL = /^(true|false)/i;
export const TOKEN_STRING = /^"([^\\]|\\.)*"/i;
export const TOKEN_CELL_ID = /^(\$?)(\w+)(\$?)(\d+)/i;
export const TOKEN_NUM = /^((([1-9][0-9]*\.|0\.)[0-9]+)|([1-9][0-9]*)|0)/;
export const TOKEN_BINOP_TIMES = /^(\/|\*)/;
export const TOKEN_BINOP_EXP = /^(\^)/;
export const TOKEN_BINOP_ADD = /^(\+|\-|&)/;
export const TOKEN_BINOP_COMP = /^(<>|=|>=|<=|<|>)/;
export const TOKEN_FOPEN = /^(\w+)\(/;
export const TOKEN_XSOPEN = /^(\w+)!/;
export const TOKEN_RPAREN = /^\)/;
export const TOKEN_LPAREN = /^\(/;
export const TOKEN_COMMA = /^,/;
export const TOKEN_COLON = /^:/;
export const TOKEN_PERCENT = /^%/;
export const TOKEN_WS = /^\s+/;

const PARSED_CACHE_THRESHOLD = 10;

const parsedExpressionCount = {};
const parsedExpressionCache = {};

export default function parse(expression) {
    if (expression in parsedExpressionCache) {
        return parsedExpressionCache[expression].clone();
    }

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

        } else if (matches = TOKEN_BINOP_EXP.exec(remainder)) {
            output = new ExpressionToken('binop_expon', matches[0]);

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
            throw new SyntaxError(`Unknown token: ${remainder}`);
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
        if (popped.type !== type) {
            throw new SyntaxError(`Expected ${type}, got ${popped.type}`);
        }
        return popped;
    }

    function parsePrimitive() {
        var accepted;
        var negative = peek();
        if (negative && negative.value === '-') {
            negative = true;
            pop();
        } else {
            negative = false;
        }
        if (accepted = accept('boolean')) {
            return new ExpressionNode('boolean', {value: accepted.value === 'true'});
        } else if (accepted = accept('number')) {
            let raw = accepted.value;
            let tmp = parseFloat(accepted.value);
            if (accept('percent')) {
                raw += '%';
                tmp /= 100;
            }
            return new ExpressionNode('number', {value: tmp, raw: raw});
        } else if (accepted = accept('string')) {
            return new ExpressionNode('string', {value: accepted.value});
        } else if (accepted = accept('ident')) {
            let rematched = TOKEN_CELL_ID.exec(accepted.value);
            return new ExpressionNode('identifier', {
                value: rematched[2] + rematched[4],
                pinRow: rematched[3] === '$',
                pinCol: rematched[1] === '$',
                raw: accepted.value,
            });
        }

        throw new SyntaxError(`Unrecognized primitive value: ${peek()}`);
    }
    function parseRange() {
        var base = parsePrimitive();
        if (!base || base.type !== 'identifier') return base;
        if (accept('colon')) {
            let end = assert('ident');
            base = new ExpressionNode('range', {
                start: base,
                end: new ExpressionNode('identifier', {value: end.value})
            });
        }
        return base;
    }
    function parseUnary() {
        var op = accept('binop_add');
        if (!op) {
            return parseParen();
        }
        return new ExpressionNode('unary', {
            operator: op.value,
            base: parseParen(),
        });
    }
    function parseParen() {
        if (!accept('lparen')) {
            return parseFunc();
        }
        const output = parseExpression();
        assert('rparen');
        return output;
    }
    function parseFunc() {
        const funcName = accept('funcopen');
        if (!funcName) {
            return parseSheetRef();
        }
        const args = [];
        while (peek()) {
            if (accept('rparen')) break;
            if (args.length) assert('comma');
            args.push(parseExpression());
        }
        return new ExpressionNode('function', {
            name: funcName.value,
            args,
        });
    }
    function parseSheetRef() {
        const sheetref = accept('sheetref');
        if (!sheetref) {
            return parseRange();
        }
        return new ExpressionNode('sheetlookup', {
            sheet: sheetref.value,
            content: parseRange(),
        });
    }
    function parseExponBinop(lval = parseUnary()) {
        const peeked = accept('binop_expon');
        if (!peeked) {
            return lval;
        }
        return parseExponBinop(
            new ExpressionNode(
                'binop_expon',
                {
                    left: lval,
                    operator: peeked.value,
                    right: parseUnary(),
                }
            )
        );
    }
    function parseTimesBinop(lval = parseExponBinop()) {
        const peeked = accept('binop_times');
        if (!peeked) {
            return lval;
        }
        return parseTimesBinop(
            new ExpressionNode(
                peeked.value === '*' ? 'binop_mult' : 'binop_div',
                {
                    left: lval,
                    operator: peeked.value,
                    right: parseExponBinop(),
                }
            )
        );
    }
    function parseAddBinop(lval = parseTimesBinop()) {
        const peeked = accept('binop_add');
        if (!peeked) {
            return lval;
        }
        return parseAddBinop(
            new ExpressionNode(
                peeked.value === '+' ?
                    'binop_add' :
                    (peeked.value === '&' ?
                        'binop_concat' :
                        'binop_sub'),
                {
                    left: lval,
                    operator: peeked.value,
                    right: parseTimesBinop(),
                }
            )
        );
    }
    function parseCompBinop() {
        const lval = parseAddBinop();
        const peeked = accept('binop_comp');
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

    const output = parseExpression();

    if (!(expression in parsedExpressionCount)) {
        parsedExpressionCount[expression] = 1;
    } else {
        parsedExpressionCount[expression]++;
        if (parsedExpressionCount[expression] >= PARSED_CACHE_THRESHOLD) {
            parsedExpressionCache[expression] = output;
        }
    }

    return output;

};
