export default class ExpressionToken {
    constructor(type, value) {
        this.type = type;
        this.value = value;
    }
    toString() {
        return `[token ${this.value}]`;
    }
};
