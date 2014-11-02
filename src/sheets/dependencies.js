WebSheet.prototype.clearDependants = function(id) {
    var deps = this.dependants[id];
    if (!deps) return;
    var remDeps;
    var idx;
    for (var i = 0; i < deps.length; i++) {
        remDeps = this.dependencies[deps[i]];
        if (!remDeps) continue;
        idx = remDeps.indexOf(id);
        if (idx !== -1) remDeps.splice(idx, 1);
    }

    if (!this.context) return;
    this.context.clearDependencies(this, id);
};

WebSheet.prototype.updateDependencies = function(cellID) {
    var deps = this.dependencies[cellID];
    if (!deps) return;

    var dep;

    if (this.depUpdateQueue) {
        for (var i = 0; i < deps.length; i++) {
            if (this.depUpdateQueue.indexOf(deps[i]) !== -1) continue;
            this.depUpdateQueue.push(deps[i]);
        }
        return;
    }

    this.depUpdateQueue = deps.concat([]); // Make a copy
    for (var i = 0; i < deps.length; i++) {
        this.depUpdateQueue.push(deps[i]);
    }

    while (this.depUpdateQueue.length) {
        dep = getCellPos(this.depUpdateQueue.shift());
        this.calculateValueAtPosition(dep.row, dep.col, this.data[dep.row][dep.col].substr(1));
    }

    this.depUpdateQueue = null;
};
