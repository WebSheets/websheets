export default class Emitter {
    constructor() {
        this.listeners = {};
        this.allListeners = [];
    }

    fire(name) {
        var i;
        for (i = 0; i < this.allListeners.length; i++) {
            this.allListeners[i](...arguments);
        }
        if (!(name in this.listeners)) return;
        var args = Array.prototype.slice.call(arguments, 1);
        for (i = 0; i < this.listeners[name].length; i++) {
            this.listeners[name][i](...args);
        }
    }
    on(name, listener) {
        if (!(name in this.listeners)) {
            this.listeners[name] = [];
        }
        this.listeners[name].push(listener);
    }
    onAll(listener) {
        this.allListeners.push(listener);
    }
    off(name, listener) {
        if (!(name in this.listeners)) return;
        var idx = this.listeners[name].indexOf(listener);
        if (idx === -1) return;
        this.listeners[name].splice(idx, 1);
    }
    offAll(listener) {
        var idx = this.allListeners.indexOf(listener);
        if (idx === -1) return;
        this.allListeners[name].splice(idx, 1);
    }
};
