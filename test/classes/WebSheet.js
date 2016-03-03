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

    describe('cycle detection', () => {

        it('should allow cycles to be banned by setting iterate to false', () => {
            const sheet = new WebSheet({}, {noBrowser: true, iterate: false});

            let hitCycle = false;
            sheet.console.on('error', err => {
                assert.ok(/cyclic reference/i.exec(err));
                hitCycle = true;
            });

            // This sheet will calculate off into infinity and never reach equilibrium.
            sheet.loadData([
                [
                    '=b1+1',
                    '=A1',
                ]
            ]);
            assert.equal(sheet.getCalculatedValueAtID('a1'), 3);
            assert.equal(sheet.getCalculatedValueAtID('b1'), 2);
            assert.ok(hitCycle);
        });

        it('should hit the iteration limit softly', () => {
            const sheet = new WebSheet({}, {
                noBrowser: true,
                iterate: true,
                maxIterations: 3,
            });

            let hitLimit = false;
            sheet.console.on('warn', err => {
                assert.ok(/max iteration limit/.exec(err));
                hitLimit = true;
            });

            // This sheet will calculate off into infinity and never reach equilibrium.
            sheet.loadData([
                [
                    '=b1+1',
                    '=A1',
                ]
            ]);
            assert.equal(sheet.getCalculatedValueAtID('a1'), 5);
            assert.equal(sheet.getCalculatedValueAtID('b1'), 4);

            assert.ok(hitLimit);
        });

        it('should stop iterating once the delta falls below the epsilon', () => {
            const sheet = new WebSheet({}, {
                noBrowser: true,
                iterate: true,
                iterationEpsilon: 0.001,
                maxIterations: 20,
            });

            let hitLimit = false;
            sheet.console.on('warn', err => {
                hitLimit = true;
            });

            // This sheet will calculate off into infinity and never reach equilibrium.
            sheet.loadData([
                ['=a2*0.7'],
                ['=A3'],
                ['=(a4+5)*0.1'],
                ['=a1'],
            ]);
            assert.equal(sheet.getCalculatedValueAtID('a1'), 0.3763440860215053);
            assert.equal(sheet.getCalculatedValueAtID('a2'), 0.5376344086021505);
            assert.equal(sheet.getCalculatedValueAtID('a3'), 0.5376344086021505);
            assert.equal(sheet.getCalculatedValueAtID('a4'), 0.3763440860215053);

            assert.ok(!hitLimit);
        });

    });
});
