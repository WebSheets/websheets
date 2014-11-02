
function Emitter() {
    var listeners = {};
    var allListeners = [];

    this.fire = function(name) {
        for (var i = 0; i < allListeners.length; i++) {
            allListeners[i].apply(null, arguments);
        }
        if (!(name in listeners)) return;
        var args = Array.prototype.slice.call(arguments, 1);
        var i;
        for (i = 0; i < listeners[name].length; i++) {
            listeners[name][i].apply(null, args);
        }
    };
    var on = this.on = function(name, listener) {
        if (!(name in listeners)) {
            listeners[name] = [];
        }
        listeners[name].push(listener);
    };
    var onAll = this.onAll = function(listener) {
        if (!(name in listeners)) {
            listeners[name] = [];
        }
        listeners[name].push(listener);
    };
    var off = this.off = function(name, listener) {
        if (!(name in listeners)) return;
        var idx = listeners[name].indexOf(listener);
        if (idx === -1) return;
        listeners[name].splice(idx, 1);
    };
    var offAll = this.offAll = function(listener) {
        var idx = allListeners.indexOf(listener);
        if (idx === -1) return;
        allListeners[name].splice(idx, 1);
    };

    this.endpoint = function(obj) {
        obj = obj || {};
        obj.on = on;
        obj.onAll = onAll;
        obj.off = off;
        obj.offAll = offAll;
        return obj;
    };
}
