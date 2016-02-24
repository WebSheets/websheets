import assert from 'assert';

import compiler from '../../src/exprCompiler';
import {getCellID} from '../../src/utils/cellID';

import {Runner} from './_utils.js';


describe('Functions', () => {
    it('and()', () => {
        const r = new Runner({A1: 1, A2: 1, A3: 0});
        assert.equal(compiler('AND(A1, A2)').run(r), 1);
        assert.equal(compiler('AND(A1, A2, A3)').run(r), 0);
        assert.equal(compiler('AND(1,2,3)').run(r), 1);
        assert.equal(compiler('AND("foo", 0)').run(r), 0);
        assert.equal(compiler('AND("foo")').run(r), 1);
    });
    it('average()', () => {
        assert.equal(compiler('AVERAGE(2,3,4)').run(null), 3);
        assert.equal(compiler('AVERAGE(4,5)').run(null), 4.5);
        assert.equal(compiler('AVERAGE("foo")').run(null), 0);
    });
    it('averagea()', () => {
        assert.equal(compiler('AVERAGEA(2,3,4)').run(null), 3);
        assert.equal(compiler('AVERAGEA(4,5)').run(null), 4.5);
    });
});
