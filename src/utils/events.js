const LISTENERS = Symbol('websheets listeners');

export function listen(elem, event, cb) {
    if (!(LISTENERS in elem)) {
        elem[LISTENERS] = {};
    }
    elem[LISTENERS][event] = elem[LISTENERS][event] || [];
    elem[LISTENERS][event].push(cb);

    elem.addEventListener(event, cb, elem !== window);
};
export function unlisten(elem, event) {
    if (!elem[LISTENERS] || !elem[LISTENERS][event]) return;
    elem[LISTENERS][event].forEach(listener => {
        elem.removeEventListener(event, listener, elem !== window);
    });
};
