var XeggexApi = require('../xeggex/XeggexApi.js');

class Market {

    static list = [];

    traded = false;

    routes = [];

    orderBook = null;

    orderbookSequence = 0;

    async getOrderBook() {
        var orderBook = await XeggexApi.getOrderBook(this.symbol);
        this.orderBook = orderBook.data;
        try {
            await this.calculateRoutes();
        } catch (e) {
            console.log(e.message);
        }
    }

    async subscribeOrderBook() {
        try {
            await XeggexApi.socket.subscribeorderbook(this.symbol, 100);
        } catch (e) {
            console.log(e);
        }
    }

    async unsubscribeOrderBook() {
        try {
            await XeggexApi.socket.unsubscribeorderbook(this.symbol);
        } catch (e) {
            console.log(e);
        }
    }

    async calculateRoutes() {
        for (var i in this.routes) {
            await this.routes[i].calculate(this);
        }
    }

    addRoute(route) {
        this.routes.push(route);
    }

    isBaseAsset(ticker) {
        return this.primaryTicker === ticker;
    }

    convert(ticker, quantity) {
        if (this.isBaseAsset(ticker)) {
            if (this.orderBook.asks[0]) {
                return quantity * parseFloat(this.orderBook.asks[0].price);
            }
        } else {
            if (this.orderBook.bids[0]) {
                return quantity / parseFloat(this.orderBook.bids[0].price);
            }
        }
    }

    hasAsset(ticker) {
        var symbol = this.symbol.split('/');
        return symbol[0] === ticker || symbol[1] === ticker;
    }

    getAskQuantity(price, slippage) {
        var quantity = 0;
        price = price * (1 + slippage);
        
        for(var i in this.orderBook.asks) {
            if(parseFloat(this.orderBook.asks[i].price) <= price) {
                quantity += parseFloat(this.orderBook.asks[i].quantity);
            }
        }
        
        return quantity;
    }
    
    
    getBidQuantity(price, slippage) {
        var quantity = 0;
        price = price * (1 - slippage);
        
        for(var i in this.orderBook.bids) {
            if(parseFloat(this.orderBook.bids[i].price) >= price) {
                quantity += parseFloat(this.orderBook.bids[i].quantity);
            }
        }
        
        return quantity;
    }

    static async getList() {
        var markets = await XeggexApi.getMarkets();
        for (var i in markets.data) {
            var market = new Market();
            Object.assign(market, markets.data[i]);
            Market.list[markets.data[i].symbol] = market;
        }
    }
    
    async getMinimumQuantity() {
        this.minimumQuantity = parseFloat(this.minimumQuantity === undefined ? 0 : this.minimumQuantity);
    }

    async cancelAllOrders() {
        return await XeggexApi.cancelAllOrders(this.symbol);
    }

    static find(tickerX, tickerY) {
        return Market.list[`${tickerX}/${tickerY}`] || Market.list[`${tickerY}/${tickerX}`] || null;
    }

    static getUsdtMarket(ticker) {
        return Market.find(ticker, 'USDT');
    }
    
}
;

XeggexApi.socket.on("notification", async (message) => {

    if (message.method === 'updateOrderbook') {

        Market.list[message.params.symbol].orderbookSequence = message.params.sequence;

        var bids = message.params.bids;
        var asks = message.params.asks;

        for (var i in bids) {
            if (parseFloat(bids[i].quantity) === 0) {
                for (var o in Market.list[message.params.symbol].orderBook.bids) {
                    if (parseFloat(Market.list[message.params.symbol].orderBook.bids[o].price) === parseFloat(bids[i].price)) {
                        Market.list[message.params.symbol].orderBook.bids.splice(o, 1);
                        break;
                    }
                }
            } else {
                var update = false;
                for (var o in Market.list[message.params.symbol].orderBook.bids) {
                    if (parseFloat(Market.list[message.params.symbol].orderBook.bids[o].price) === parseFloat(bids[i].price)) {
                        Market.list[message.params.symbol].orderBook.bids[o] = bids[i];
                        update = true;
                        break;
                    }
                }
                if (!update) {
                    Market.list[message.params.symbol].orderBook.bids.push(bids[i]);
                }
            }
        }

        Market.list[message.params.symbol].orderBook.bids.splice(100, Market.list[message.params.symbol].orderBook.bids.length - 100);
        Market.list[message.params.symbol].orderBook.bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));


        for (var i in asks) {
            if (parseFloat(asks[i].quantity) === 0) {
                for (var o in Market.list[message.params.symbol].orderBook.asks) {
                    if (parseFloat(Market.list[message.params.symbol].orderBook.asks[o].price) === parseFloat(asks[i].price)) {
                        Market.list[message.params.symbol].orderBook.asks.splice(o, 1);
                        break;
                    }
                }
            } else {
                var update = false;
                for (var o in Market.list[message.params.symbol].orderBook.asks) {
                    if (parseFloat(Market.list[message.params.symbol].orderBook.asks[o].price) === parseFloat(asks[i].price)) {
                        Market.list[message.params.symbol].orderBook.asks[o] = asks[i];
                        update = true;
                        break;
                    }
                }
                if (!update) {
                    Market.list[message.params.symbol].orderBook.asks.push(asks[i]);
                }
            }
        }
        Market.list[message.params.symbol].orderBook.asks.splice(100, Market.list[message.params.symbol].orderBook.asks.length - 100);
        Market.list[message.params.symbol].orderBook.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

        try {
            await Market.list[message.params.symbol].calculateRoutes();
        } catch (e) {
            console.log(e.message);
        }
    }
});

module.exports = Market;