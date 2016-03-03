import execFunc from './functions';
import {getCellID, getCellPos} from '../utils/cellID';
import {parseNumMaybe} from './functions';
import {TOKEN_CELL_ID} from './index';


export default class ExpressionNode {
    constructor(type, params) {
        this.type = type;
        Object.assign(this, params);
    }

    walk(cb) {
        if (cb(this) === false) return;
        switch (this.type) {
            case 'range':
                this.start.walk(cb);
                this.end.walk(cb);
                return;
            case 'function':
                this.args.forEach(arg => arg.walk(cb));
                return;
            case 'sheetlookup':
                this.content.walk(cb);
                return;
            case 'binop_mult':
            case 'binop_div':
            case 'binop_add':
            case 'binop_sub':
            case 'binop_concat':
            case 'binop_expon':
            case 'binop_comp_lt':
            case 'binop_comp_lte':
            case 'binop_comp_gt':
            case 'binop_comp_gte':
            case 'binop_comp_eq':
            case 'binop_comp_neq':
                this.left.walk(cb);
                this.right.walk(cb);
        }
    }

    toString() {
        switch (this.type) {
            case 'boolean':
                return this.value ? 'true' : 'false';
            case 'string':
                return JSON.stringify(this.value);
            case 'number':
                return this.raw.toString();
            case 'identifier':
                return this.raw.toUpperCase();
            case 'sheetlookup':
                return `${this.sheet}!${this.content}`;
            case 'range':
                return `${this.start}:${this.end}`;
            case 'function':
                return `${this.name}(${this.args.map(a => a.toString()).join(',')})`;
            case 'binop_mult':
                return `${this.left}*${this.right}`;
            case 'binop_div':
                return `${this.left}/${this.right}`;
            case 'binop_add':
                return `${this.left}+${this.right}`;
            case 'binop_sub':
                return `${this.left}-${this.right}`;
            case 'binop_concat':
                return `${this.left}&${this.right}`;
            case 'binop_expon':
                return `${this.left}^${this.right}`;
            case 'binop_comp_lt':
            case 'binop_comp_lte':
            case 'binop_comp_gt':
            case 'binop_comp_gte':
            case 'binop_comp_eq':
            case 'binop_comp_neq':
                return `${this.left}${this.operator}${this.right}`;
        }
    }

    clone() {
        switch (this.type) {
            case 'boolean':
            case 'string':
                return new ExpressionNode(this.type, {value: this.value});
            case 'number':
                return new ExpressionNode(this.type, {value: this.value, raw: this.raw});
            case 'identifier':
                return new ExpressionNode(
                    this.type,
                    {value: this.value, pinRow: this.pinRow, pinCol: this.pinCol, raw: this.raw}
                );
            case 'sheetlookup':
                return new ExpressionNode(
                    this.type,
                    {sheet: this.sheet, content: this.content.clone()}
                );
            case 'range':
                return new ExpressionNode(
                    this.type,
                    {start: this.start.clone(), end: this.end.clone()}
                );
            case 'function':
                return new ExpressionNode(
                    this.type,
                    {name: this.name, args: this.args.map(arg => arg.clone())}
                );
            case 'binop_mult':
            case 'binop_div':
            case 'binop_add':
            case 'binop_sub':
            case 'binop_concat':
            case 'binop_expon':
                return new ExpressionNode(
                    this.type,
                    {left: this.left.clone(), right: this.right.clone()}
                );
            case 'binop_comp_lt':
            case 'binop_comp_lte':
            case 'binop_comp_gt':
            case 'binop_comp_gte':
            case 'binop_comp_eq':
            case 'binop_comp_neq':
                return new ExpressionNode(
                    this.type,
                    {
                        left: this.left.clone(),
                        operator: this.operator,
                        right: this.right.clone()
                    }
                );
        }
    }

    adjust(deltaRow, deltaCol) {
        this.walk(x => {
            if (x.type !== 'identifier') return;
            var pos = getCellPos(x.value);
            var row = pos.row + (x.pinRow ? 0 : deltaRow);
            var col = pos.col + (x.pinCol ? 0 : deltaCol);
            x.value = getCellID(row, col);
            var rematched = TOKEN_CELL_ID.exec(x.value);
            x.raw = (x.pinCol ? '$' : '') + rematched[2] + (x.pinRow ? '$' : '') + rematched[4];
        });
    }


    findCellDependencies(cb) {
        this.walk(node => {
            if (node.type === 'identifier') {
                cb(node.value);
            } else if (node.type === 'range') {
                iterateRangeNode(
                    node,
                    (row, col) => cb(getCellID(row, col))
                );
            } else if (node.type === 'sheetlookup') {
                return false; // Kills traversal; handled by findSheetDependencies
            }
        });
    }

    findSheetDependencies(cb) {
        this.walk(node => {
            if (node.type !== 'sheetlookup') {
                return;
            }
            node.content.findCellDependencies(cellID => cb(node.sheet, cellID));
            return false;
        });
    }

    run(sheet) {
        switch (this.type) {
            case 'boolean':
            case 'number':
            case 'string':
                return this.value;
            case 'identifier':
                return sheet.getCalculatedValueAtID(this.value);
            case 'sheetlookup':
                return this.content.run(sheet.getSheet(this.sheet));
            case 'binop_mult':
                return this.left.run(sheet) * this.right.run(sheet);
            case 'binop_div':
                return this.left.run(sheet) / this.right.run(sheet);
            case 'binop_add':
                return parseFloat(this.left.run(sheet)) + parseFloat(this.right.run(sheet));
            case 'binop_sub':
                return this.left.run(sheet) - this.right.run(sheet);
            case 'binop_concat':
                return this.left.run(sheet).toString() + this.right.run(sheet).toString();
            case 'binop_expon':
                return Math.pow(this.left.run(sheet), this.right.run(sheet));
            case 'binop_comp_lt':
                return parseFloat(this.left.run(sheet)) < parseFloat(this.right.run(sheet));
            case 'binop_comp_lte':
                return parseFloat(this.left.run(sheet)) <= parseFloat(this.right.run(sheet));
            case 'binop_comp_gt':
                return parseFloat(this.left.run(sheet)) > parseFloat(this.right.run(sheet));
            case 'binop_comp_gte':
                return parseFloat(this.left.run(sheet)) >= parseFloat(this.right.run(sheet));
            case 'binop_comp_eq':
                return this.left.run(sheet) == this.right.run(sheet);
            case 'binop_comp_neq':
                return this.left.run(sheet) != this.right.run(sheet);
            case 'range':
                var rangeCells = [];
                iterateRangeNode(this, (row, col) => {
                    rangeCells.push(
                        parseNumMaybe(sheet.getCalculatedValueAtPos(row, col))
                    );
                });
                return rangeCells;
        }
        if (this.type !== 'function') {
            throw new TypeError('Unknown exression node');
        }
        return execFunc(this.name, this.args, sheet);

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
