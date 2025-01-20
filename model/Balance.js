var XeggexApi = require('../xeggex/XeggexApi.js');
var Asset = require('./Asset.js');


module.exports = class Balance {

    static list = [];
    static balancing = false;

    static async getList() {
        try {
            var balances = await XeggexApi.getBalances();
            for (var i in balances.data) {
                var balance = new Balance();
                Object.assign(balance, balances.data[i]);
                Balance.list[balance.asset] = balance;
            }
        } catch (e) {
            console.log(e.message);
        }
    }

    /**
     * 
     * @returns {Asset}
     */
    getAsset() {
        return Asset.list[this.asset] || null;
    }

    availableInUsdt() {
        return this.getAsset().convertToUsdt(parseFloat(this.available));
    }

    tradeableInUsdt() {
        return this.getAsset().convertToUsdt(parseFloat(this.available) + parseFloat(this.held));
    }

};