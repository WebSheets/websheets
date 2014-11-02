var directExprFuncs = {};
function registerDirectFunc(base, method, alias) {
    directExprFuncs[alias || method] = base[method].bind(base);
}

registerDirectFunc(Math, 'abs');
registerDirectFunc(Math, 'acos');
registerDirectFunc(Math, 'acosh');
registerDirectFunc(Math, 'asin');
registerDirectFunc(Math, 'asinh');
registerDirectFunc(Math, 'atan');
registerDirectFunc(Math, 'atan2');
registerDirectFunc(Math, 'atanh');
registerDirectFunc(Math, 'ceil');
registerDirectFunc(Math, 'ceil', 'ceiling');
registerDirectFunc(Math, 'cos');
registerDirectFunc(Math, 'cosh');
registerDirectFunc(Math, 'exp');
registerDirectFunc(Math, 'floor', 'int');
registerDirectFunc(Math, 'floor');
registerDirectFunc(Math, 'log', 'ln');
registerDirectFunc(Math, 'log10', 'log10');
registerDirectFunc(Math, 'pow', 'power');
registerDirectFunc(Math, 'pow');
registerDirectFunc(Math, 'random', 'rand');
registerDirectFunc(Math, 'random');
registerDirectFunc(Math, 'sin');
registerDirectFunc(Math, 'sinh');
registerDirectFunc(Math, 'sqrt');
registerDirectFunc(Math, 'tan');
registerDirectFunc(Math, 'tanh');

registerDirectFunc(String, 'fromCharCode', 'char');

function execFunc(name, myArgs) {
    var args = [];
    var argTmp;
    for (var argI = 0; argI < myArgs.length; argI++) {
        argTmp = myArgs[argI].run(sheet);
        if (argTmp && typeof argTmp === 'object') {
            args = args.concat(argTmp);
        } else {
            args.push(argTmp);
        }
    }

    name = name.toLowerCase();
    if (name in directExprFuncs) {
        return directExprFuncs[name].apply(null, args);
    }

    var tmp;
    var tmp2;
    switch (name) {
        case 'and': return args.map(parseNumAlways).reduce(function(a, b) {return a && b;});
        case 'average':
            tmp = args.filter(isNotNaNAsFloat);
            return tmp.length ? tmp.reduce(add) / tmp.length : 0;
        case 'averagea':
            return args.map(parseNumAlways).reduce(add) / args.length;
        case 'code':
        case 'asc': return args[0].toString().charCodeAt(0) || 0;
        case 'chr':
        case 'combin': return factorial(args[0]) / factorial(args[0] - args[1]);
        case 'concatenate': return args.reduce(function(a, b) {return a.toString() + b.toString();});
        case 'count': return args.filter(isNotNaNAsFloat).length;
        case 'counta': return args.filter(function(x) {return x !== '' && x !== null && x !== undefined;}).length;
        case 'countblank': return args.filter(function(x) {return x === '';}).length;
        case 'countif': return args.filter(function(x) {return x == args[1];}).length;
        case 'degrees': return args[0] * 57.2957795;
        case 'dollar': return '$' + commas(args[0] | 0) + (args[1] ? '.' + parseFloat(args[0]).toFixed(args[1]).split('.')[1] : '');
        case 'even': return Math.ceil(args[0] / 2) * 2;
        case 'exact': return args[0].toString() === args[1].toString();
        case 'fact': return factorial(args[0]);
        case 'factdouble': return factorial(args[0], 2);
        case 'search':
        case 'find': return args[1].toString().substr((args[2] || 1) - 1).indexOf(args[0].toString());
        case 'fixed': return (args[2] ? ident : commas)(args[0]) + (args[1] ? '.' + parseFloat(args[0]).toFixed(args[1]).split('.')[1] : '');
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
        case 'product': return args.reduce(function(a, b) {return a * b;});
        case 'proper': return args[0].toString().split(/\s/).map(function(s) {return s[0].toUpperCase() + s.substr(1);});
        case 'quotient': return args[0] / args[1] | 0;
        case 'radians': return args[0] / 57.2957795;
        case 'randbetween': return Math.random() * (args[1] - args[0]) + args[0];
        case 'replace': return args[0].toString().substr(0, args[1] - 1) + args[3].toString() + args[0].toString().substr(args[1] - 1 + args[2]);
        case 'rept': return (new Array(args[1] + 1)).join(args[0].toString());
        case 'right': return args[0].toString().substr(-1 * args[1] || -1);
        case 'round': return Math.round(args[0] || 0).toFixed(args[1] || 0);
        case 'fix':
        case 'rounddown': return args[0] < 0 ? Math.ceil(args[0]) : Math.floor(args[0]);
        case 'roundup': return args[0] > 0 ? Math.ceil(args[0]) : Math.floor(args[0]);
        case 'sign': return args[0] / Math.abs(args[0]) || 0;
        case 'space': return (new Array(args[0] + 1)).join(' ');
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
}
