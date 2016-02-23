try {
    module.exports = require('./build');
} catch (e) {
    module.exports = require('./src');
}
