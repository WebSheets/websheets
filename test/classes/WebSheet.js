import assert from 'assert';

import WebSheet from '../../src/WebSheet';


describe('WebSheet', () => {
    describe('loadData', () => {

        it('should insert content in the correct positions', () => {
            const sheet = new WebSheet({}, {noBrowser: true});
            sheet.loadData([[1, 2, 3]]);
            assert.equal(sheet.getCalculatedValueAtID('a1'), 1);
            assert.equal(sheet.getCalculatedValueAtID('b1'), 2);
            assert.equal(sheet.getCalculatedValueAtID('c1'), 3);
        });

        it('should calculate values that are loaded', () => {
            const sheet = new WebSheet({}, {noBrowser: true});
            sheet.loadData([[1, 2, '=a1-b1']]);
            assert.equal(sheet.getCalculatedValueAtID('a1'), 1);
            assert.equal(sheet.getCalculatedValueAtID('b1'), 2);
            assert.equal(sheet.getCalculatedValueAtID('c1'), -1);
        });

    });
    describe('getCalculatedValueAtID', () => {

        it('should deal with calculated values that are falsey but not nullish', () => {
            const sheet = new WebSheet({}, {noBrowser: true});
            sheet.loadData([
                [
                    '=10-10',
                    '=A1+123',
                ]
            ]);
            assert.equal(sheet.getCalculatedValueAtID('b1'), 123);
        });

    });
});
