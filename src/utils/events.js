function listen(elem, event, cb) {
    elem.listeners = elem.listeners || {};
    elem.listeners[event] = elem.listeners[event] || [];
    elem.listeners[event].push(cb);

    elem.addEventListener(event, cb, elem !== window);
}
function unlisten(elem, event) {
    if (!elem.listeners || !elem.listeners[event]) return;
    elem.listeners[event].forEach(function(listener) {
        elem.removeEventListener(event, listener, elem !== window);
    });
}
