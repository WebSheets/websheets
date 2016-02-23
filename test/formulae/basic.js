import assert from 'assert';

import compiler from '../../src/exprCompiler';
import {getCellID} from '../../src/utils/cellID';


class Runner {
    constructor(values, sheets = {}) {
        this.data = values;
        this.sheets = sheets;
    }
    getCalculatedValueAtPos(row, col) {
        return this.getCalculatedValueAtID(getCellID(row, col));
    }
    getCalculatedValueAtID(id) {
        return this.data[id] || 1;
    }
    getSheet(x) {
        return this.sheets[x];
    }
}


describe('Formulae', () => {
    it('should parse functions', () => {
        const r = new Runner({
            A1: 1,
            A2: 2,
            A4: 4,
        });

        assert.equal(compiler('SQRT(3*4+4)').run(null), 4);
        assert.equal(compiler('SQRT(2^5-4*4)').run(null), 4);
        assert.equal(compiler('SQRT(A2^5-4*A4)').run(r), 4);

    });
});
