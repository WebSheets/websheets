// This file is reserved for helper functions that are only useful in the context of spreadsheets


function factorial(n, modifier) {
    return n < 2 ? n : n * factorial(n - (modifier || 1));
}

function add(a, b) {
    return a + b;
}

function sum(elems) {
    return elems.reduce(function(a, b) {
        return a + b;
    }, 0);
}

function commas(num) {
    return num.toString().split(/(?=(?:\d\d\d)*$)/).join(',');
}


function isNotNaNAsFloat(value) {
    return !isNaN(parseFloat(value));
}

function parseNumMaybe(value) {
    var parsed = parseFloat(value);
    return isNaN(parsed) ? value : parsed;
}

function parseNumAlways(value) {
    var parsed = parseFloat(value);
    return isNaN(parsed) ? (value ? 1 : 0) : parsed;
}
