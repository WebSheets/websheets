import * as formulajs from 'formulajs';


const directExprFuncs = {
    AND: (...args) => args.every(parseNumAlways),
    ISBLANK: x => x === '' || x === null,
    NOT: x => !parseNumAlways(x),
    OR: (...args) => args.some(parseNumAlways),
    PI: () => Math.PI,
};

for (let key in formulajs) {
    if (typeof formulajs[key] !== 'function') {
        continue;
    }
    if (key in directExprFuncs) {
        continue;
    }
    directExprFuncs[key.toUpperCase()] = formulajs[key];
}


export default function execFunc(name, myArgs, sheet) {
    const executedArgs = myArgs.map(x => x.run(sheet));
    let args = [];
    executedArgs.forEach(a => {
        if (a && typeof a === 'object') {
            args = args.concat(a);
        } else {
            args.push(a);
        }
    });

    const ucaseName = name.toUpperCase();
    if (ucaseName in directExprFuncs) {
        return directExprFuncs[ucaseName](...args);
    }

    throw new Error('#NAME?');
};


export function parseNumMaybe(value) {
    if (value === true) {
        return 1;
    } else if (value === false) {
        return 0;
    }
    var parsed = parseFloat(value);
    return isNaN(parsed) ? value : parsed;
};

export function parseNumAlways(value) {
    if (value === true) {
        return 1;
    } else if (value === false) {
        return 0;
    }
    var parsed = parseFloat(value);
    return isNaN(parsed) ? (value ? 1 : 0) : parsed;
}
