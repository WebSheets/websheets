import assert from 'assert';

import compiler from '../../src/exprCompiler';
import {getCellID} from '../../src/utils/cellID';

import {Runner} from './_utils.js';


describe('Formulae', () => {
    it('should parse multiplication with the correct precedence', () => {
        assert.equal(compiler('2*3+4').run(null), 10);
        assert.equal(compiler('2+3*4').run(null), 14);
    });
    it('should parse exponents with the correct precedence', () => {
        assert.equal(compiler('2^4*100').run(null), 1600);
    });
    it('should parse chains of additions', () => {
        assert.equal(compiler('1+1+1+1+1').run(null), 5);
    });

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
