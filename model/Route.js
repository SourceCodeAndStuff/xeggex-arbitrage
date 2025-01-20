var XeggexApi = require('../xeggex/XeggexApi.js');
const Market = require('./Market.js');
const Asset = require('./Asset.js');
const Balance = require('./Balance.js');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function addPlusOrSpace(number) {
    if (number > 0) {
        return '<span style="color: #00C186">+' + number + '</span>';
    }
    if (number < 0) {
        return '<span style="color: #FF5761">' + number + '</span>';
    }
    return number;
}

module.exports = class Route {

    static list = [];
    static trading = false;
    static trades = 0;

    lastTradeTriggerMarket = null;

    assetX = null;
    assetY = null;
    assetZ = null;

    minX = 0;
    minY = 0;
    minZ = 0;

    askX = null;
    bidX = null;
    askY = null;
    bidY = null;
    askZ = null;
    bidZ = null;

    askQuantityX = null;
    bidQuantityX = null;
    askQuantityY = null;
    bidQuantityY = null;
    askQuantityZ = null;
    bidQuantityZ = null;

    inputX = null;
    inputY = null;
    inputZ = null;

    profitX = 0;
    profitY = 0;
    profitZ = 0;

    roiX = 0;
    roiY = 0;
    roiZ = 0;

    tradeX = null;
    tradeY = null;
    tradeZ = null;

    marketX = null;
    marketY = null;
    marketZ = null;

    constructor(assetX, assetY, assetZ, marketX, marketY, marketZ) {
        this.assetX = assetX;
        this.assetY = assetY;
        this.assetZ = assetZ;

        this.marketX = marketX;
        this.marketY = marketY;
        this.marketZ = marketZ;
    }

    static floorToDecimals(value, decimals) {
        if (decimals === 0) {
            return Math.floor(value);
        }
        const factor = Math.pow(10, decimals);
        return Math.floor(value * factor) / factor;
    }

    async calculate(triggerMarket) {
        if (this.lastTradeTriggerMarket === triggerMarket.symbol) {
            this.lastTradeTriggerMarket = null;
        }
        if (this.lastTradeTriggerMarket === null &&
                Route.trading === false &&
                this.marketX.orderBook &&
                this.marketY.orderBook &&
                this.marketZ.orderBook &&
                this.marketX.orderBook.asks[0] &&
                this.marketX.orderBook.bids[0] &&
                this.marketY.orderBook.asks[0] &&
                this.marketY.orderBook.bids[0] &&
                this.marketZ.orderBook.asks[0] &&
                this.marketZ.orderBook.bids[0]) {
            const fee = 0.0012;
            const risk = 0.3;
            const minProfit = 0.000;
            const priceDeviation = 0.000;
            const priceSlippage = 0.005;
            const quantitySlippage = 0.002;

            this.askX = (parseFloat(this.marketX.orderBook.asks[0].price) * (1 + priceDeviation)).toFixed(this.marketX.priceDecimals);
            this.bidX = (parseFloat(this.marketX.orderBook.bids[0].price) * (1 - priceDeviation)).toFixed(this.marketX.priceDecimals);
            this.askY = (parseFloat(this.marketY.orderBook.asks[0].price) * (1 + priceDeviation)).toFixed(this.marketY.priceDecimals);
            this.bidY = (parseFloat(this.marketY.orderBook.bids[0].price) * (1 - priceDeviation)).toFixed(this.marketY.priceDecimals);
            this.askZ = (parseFloat(this.marketZ.orderBook.asks[0].price) * (1 + priceDeviation)).toFixed(this.marketZ.priceDecimals);
            this.bidZ = (parseFloat(this.marketZ.orderBook.bids[0].price) * (1 - priceDeviation)).toFixed(this.marketZ.priceDecimals);

            this.askQuantityX = parseFloat(this.marketX.getAskQuantity(this.askX, quantitySlippage));
            this.bidQuantityX = parseFloat(this.marketX.getBidQuantity(this.bidX, quantitySlippage));
            this.askQuantityY = parseFloat(this.marketY.getAskQuantity(this.askY, quantitySlippage));
            this.bidQuantityY = parseFloat(this.marketY.getBidQuantity(this.bidY, quantitySlippage));
            this.askQuantityZ = parseFloat(this.marketZ.getAskQuantity(this.askZ, quantitySlippage));
            this.bidQuantityZ = parseFloat(this.marketZ.getBidQuantity(this.bidZ, quantitySlippage));

            const availableXInUsdt = this.marketX.isBaseAsset(this.assetX.ticker) ? this.assetX.convertToUsdt(this.marketX.isBaseAsset(this.assetX.ticker) ? this.bidQuantityX : this.askQuantityX) : this.assetY.convertToUsdt(this.marketY.isBaseAsset(this.assetX.ticker) ? this.bidQuantityX : this.askQuantityX);
            const availableYInUsdt = this.marketY.isBaseAsset(this.assetY.ticker) ? this.assetY.convertToUsdt(this.marketY.isBaseAsset(this.assetY.ticker) ? this.bidQuantityY : this.askQuantityY) : this.assetZ.convertToUsdt(this.marketZ.isBaseAsset(this.assetY.ticker) ? this.bidQuantityY : this.askQuantityY);
            const availableZInUsdt = this.marketZ.isBaseAsset(this.assetZ.ticker) ? this.assetZ.convertToUsdt(this.marketZ.isBaseAsset(this.assetZ.ticker) ? this.bidQuantityZ : this.askQuantityZ) : this.assetX.convertToUsdt(this.marketX.isBaseAsset(this.assetZ.ticker) ? this.bidQuantityZ : this.askQuantityZ);

            const balanceXUsdt = Balance.list[this.assetX.ticker].availableInUsdt() * risk;
            const balanceYUsdt = Balance.list[this.assetY.ticker].availableInUsdt() * risk;
            const balanceZUsdt = Balance.list[this.assetZ.ticker].availableInUsdt() * risk;

            this.minX = this.marketX.minimumQuantity;
            this.minY = this.marketY.minimumQuantity;
            this.minZ = this.marketZ.minimumQuantity;

            const tradeUsdt = Math.max(Math.min(balanceXUsdt, balanceYUsdt, balanceZUsdt, availableXInUsdt, availableYInUsdt, availableZInUsdt), 0.1);

            this.inputX = this.assetX.convertFromUsdt(tradeUsdt);
            this.inputY = this.assetY.convertFromUsdt(tradeUsdt);
            this.inputZ = this.assetZ.convertFromUsdt(tradeUsdt);

            if (this.marketX.isBaseAsset(this.assetX.ticker)) {
                this.inputX = Math.max(parseFloat(this.inputX).toFixed(this.marketX.quantityDecimals), this.inputX);
            } else {
                this.inputY = Math.max(parseFloat(this.inputY).toFixed(this.marketX.quantityDecimals), this.inputY);
            }
            if (this.marketY.isBaseAsset(this.assetY.ticker)) {
                this.inputY = Math.max(parseFloat(this.inputY).toFixed(this.marketY.quantityDecimals), this.inputY);
            } else {
                this.inputZ = Math.max(parseFloat(this.inputZ).toFixed(this.marketY.quantityDecimals), this.inputZ);
            }
            if (this.marketZ.isBaseAsset(this.assetZ.ticker)) {
                this.inputZ = Math.max(parseFloat(this.inputZ).toFixed(this.marketZ.quantityDecimals), this.inputZ);
            } else {
                this.inputX = Math.max(parseFloat(this.inputX).toFixed(this.marketZ.quantityDecimals), this.inputX);
            }

            var maxUsdt = Math.max(this.assetX.convertToUsdt(this.inputX), this.assetY.convertToUsdt(this.inputY), this.assetZ.convertToUsdt(this.inputZ));

            this.inputX = this.assetX.convertFromUsdt(maxUsdt);
            this.inputY = this.assetY.convertFromUsdt(maxUsdt);
            this.inputZ = this.assetZ.convertFromUsdt(maxUsdt);

            if (this.marketX.isBaseAsset(this.assetX.ticker)) {
                // Sell assetX
                this.inputX = parseFloat(this.inputX).toFixed(this.marketX.quantityDecimals);
                this.tradeX = this.inputX * (this.bidX * (1 - priceSlippage));
            } else {
                // Buy assetX
                this.tradeX = this.inputX / (this.askX * (1 + priceSlippage));
                this.tradeX = Route.floorToDecimals(this.tradeX, this.marketX.quantityDecimals);
            }


            if (this.marketY.isBaseAsset(this.assetY.ticker)) {
                // Sell assetY
                this.inputY = parseFloat(this.inputY).toFixed(this.marketY.quantityDecimals);
                this.tradeY = this.inputY * (this.bidY * (1 - priceSlippage));
            } else {
                // Buy assetY
                this.tradeY = this.inputY / (this.askY * (1 + priceSlippage));
                this.tradeY = Route.floorToDecimals(this.tradeY, this.marketY.quantityDecimals);
            }

            if (this.marketZ.isBaseAsset(this.assetZ.ticker)) {
                // Sell assetZ
                this.inputZ = parseFloat(this.inputZ).toFixed(this.marketZ.quantityDecimals);
                this.tradeZ = this.inputZ * (this.bidZ * (1 - priceSlippage));
            } else {
                // Buy assetZ
                this.tradeZ = this.inputZ / (this.askZ * (1 + priceSlippage));
                this.tradeZ = Route.floorToDecimals(this.tradeZ, this.marketZ.quantityDecimals);
            }

            this.tradeX -= this.tradeX * fee;
            this.tradeY -= this.tradeY * fee;
            this.tradeZ -= this.tradeZ * fee;

            this.profitX = this.tradeZ - this.inputX;
            this.profitY = this.tradeX - this.inputY;
            this.profitZ = this.tradeY - this.inputZ;

            this.roiX = this.profitX / this.inputX * 100;
            this.roiY = this.profitY / this.inputY * 100;
            this.roiZ = this.profitZ / this.inputZ * 100;
            
            this.roi = this.roiX + this.roiY + this.roiZ;

            if (Route.trading === false &&
                    Balance.balancing === false &&
                    this.roi > minProfit &&
                    this.inputX > 0 &&
                    this.inputY > 0 &&
                    this.inputZ > 0 &&
                    this.minX <= (this.marketX.isBaseAsset(this.assetX.ticker) ? this.inputX : this.inputY) &&
                    this.minY <= (this.marketY.isBaseAsset(this.assetY.ticker) ? this.inputY : this.inputZ) &&
                    this.minZ <= (this.marketZ.isBaseAsset(this.assetZ.ticker) ? this.inputZ : this.inputX) &&
                    parseFloat(Balance.list[this.assetX.ticker].available) > this.inputX &&
                    parseFloat(Balance.list[this.assetY.ticker].available) > this.inputY &&
                    parseFloat(Balance.list[this.assetZ.ticker].available) > this.inputZ) {
                Route.trading = true;
                console.log(this.log());
                this.lastTradeTriggerMarket = triggerMarket.symbol;
                await this.trade();
                Route.trades++;
            }
        }
    }

    async trade() {
        try {
            XeggexApi.placeOrder(this.marketX.isBaseAsset(this.assetX.ticker) ? 'sell' : 'buy', this.marketX.symbol, this.marketX.isBaseAsset(this.assetX.ticker) ? this.bidX : this.askX, this.marketX.isBaseAsset(this.assetX.ticker) ? this.inputX : this.inputY);
            XeggexApi.placeOrder(this.marketY.isBaseAsset(this.assetY.ticker) ? 'sell' : 'buy', this.marketY.symbol, this.marketY.isBaseAsset(this.assetY.ticker) ? this.bidY : this.askY, this.marketY.isBaseAsset(this.assetY.ticker) ? this.inputY : this.inputZ);
            await XeggexApi.placeOrder(this.marketZ.isBaseAsset(this.assetZ.ticker) ? 'sell' : 'buy', this.marketZ.symbol, this.marketZ.isBaseAsset(this.assetZ.ticker) ? this.bidZ : this.askZ, this.marketZ.isBaseAsset(this.assetZ.ticker) ? this.inputZ : this.inputX);
            await Balance.getList();
        } catch (e) {
            console.log(e.message);
        }
        Route.trading = false;
    }

    log() {
        return this.assetX.ticker + " -> " +
                this.assetY.ticker + " -> " +
                this.assetZ.ticker + " : " +
                parseFloat(this.inputX).toFixed(8) + " = " + this.tradeZ.toFixed(8) + " " +
                parseFloat(this.inputY).toFixed(8) + " = " + this.tradeX.toFixed(8) + " " +
                parseFloat(this.inputZ).toFixed(8) + " = " + this.tradeY.toFixed(8) + " : " +
                this.roi.toFixed(4) + "%";
    }

    html() {
        return '<td>' +
                this.assetX.ticker + ">" +
                this.assetY.ticker + ">" +
                this.assetZ.ticker +
                '</td>' +
                '<td class="text-center">' +
                parseFloat(this.inputX).toFixed(8) + " = " + this.tradeZ.toFixed(8) + " (" + addPlusOrSpace(this.roiX.toFixed(3)) + "%)" +
                '</td>' +
                '<td class="text-center">' +
                parseFloat(this.inputY).toFixed(8) + " = " + this.tradeX.toFixed(8) + " (" + addPlusOrSpace(this.roiY.toFixed(3)) + "%)" +
                '</td>' +
                '<td class="text-center">' +
                parseFloat(this.inputZ).toFixed(8) + " = " + this.tradeY.toFixed(8) + " (" + addPlusOrSpace(this.roiZ.toFixed(3)) + "%)" +
                '</td>' +
                '<td class="text-end">' +
                addPlusOrSpace(this.roi.toFixed(4)) + "%" +
                '</td>';
    }

    static async find() {
        for (var x in Asset.list) {
            for (var y in Asset.list) {
                if (x === y) {
                    continue;
                }
                for (var z in Asset.list) {
                    if (x === z || y === z || Route.exists(x, y, z)) {
                        continue;
                    }

                    const marketX = Market.find(x, y);
                    const marketY = Market.find(y, z);
                    const marketZ = Market.find(z, x);

                    if (marketX && marketY && marketZ) {
                        const route = new Route(Asset.list[x], Asset.list[y], Asset.list[z], marketX, marketY, marketZ);
                        Route.list[`${x}_${y}_${z}`] = route;
                        marketX.addRoute(route);
                        marketY.addRoute(route);
                        marketZ.addRoute(route);
                    }
                }
            }
        }
    }

    static exists(x, y, z) {
        return Route.list[`${x}_${y}_${z}`] !== undefined || Route.list[`${z}_${x}_${y}`] !== undefined || Route.list[`${y}_${z}_${x}`] !== undefined;
    }
};
