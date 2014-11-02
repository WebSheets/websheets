function ident(x) {
    return x;
}

function extend(base, extension) {
    extension = extension || {};
    for (var i in extension) {
        if (!extension.hasOwnProperty(i)) continue;
        base[i] = extension[i];
    }
    return base;
}

function defaults(base, def) {
    for (var i in def) {
        if (!def.hasOwnProperty(i)) continue;
        base[i] = base[i] || def[i];
    }
    return base;
}

function isNaN(x) {
    return window.isNaN(x);
}

