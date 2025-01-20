var XeggexApi = require('../xeggex/XeggexApi.js');
var Market = require('./Market.js');

module.exports = class Asset {

    markets = [];

    static list = [];

    static usedMarkets = [];

    static allowed = [
        'USDT',
        'DOGE',
        'PEP',
        'XPE'
    ]

    static async getList() {
        var assets = await XeggexApi.getAssets();
        for (var i in assets.data) {
            if (Asset.allowed.includes(assets.data[i].ticker)) {
                var asset = new Asset();
                Object.assign(asset, assets.data[i]);
                Asset.list[asset.ticker] = asset;
                for (var x in Asset.allowed) {
                    for (var y in Asset.allowed) {
                        if (x === y) {
                            continue;
                        }
                        var market = Market.find(Asset.allowed[x], Asset.allowed[y]);
                        if (market) {
                            asset.markets[market.symbol] = market;
                            Asset.usedMarkets[market.symbol] = market;
                        }
                    }
                }
            }
        }
    }

    convertToUsdt(quantity) {
        if (this.ticker === 'USDT') {
            return quantity;
        }
        var market = Market.getUsdtMarket(this.ticker);
        return market.convert(this.ticker, quantity);
    }

    convertFromUsdt(quantity) {
        if (this.ticker === 'USDT') {
            return quantity;
        }
        var market = Market.getUsdtMarket(this.ticker);
        return market.convert('USDT', quantity);
    }
    
};