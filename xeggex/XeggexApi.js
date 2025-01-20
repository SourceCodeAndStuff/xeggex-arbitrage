const axios = require('axios');
const crypto = require('crypto');
const XeggexSocketClient = require('./XeggexSocketClient.js');


class XeggexApi {

    static API_KEY = "645fe0306413e34f1f9c6810cff32606";
    static API_SECRET = "0a37aa607de17cee0d7b96b0ba998264d2f849ddc0aefd80";
    static BASE_URL = 'https://api.xeggex.com/api/v2';

    static socket = new XeggexSocketClient(XeggexApi.API_KEY, XeggexApi.API_SECRET);

    static async placeOrder(side, symbol, price, amount, type = 'MARKET') {
        console.log("Placing order symbol: " + symbol + " side: " + side + " price: " + price + " amount: " + amount + " ...");
        try {
            const params = {
                userProvidedId: null,
                symbol: symbol,
                side: side,
                type: type,
                price: price,
                quantity: amount,
                strictValidate: false
            };
            return XeggexApi.post('createOrder', params);
        } catch (error) {
            console.error('Error placing order:', error.response ? error.response.data : error.message);
    }
    }

    static async cancelAllOrders(symbol) {
        console.log("Cancelling orders for " + symbol + "...");
        await XeggexApi.post('cancelallorders', {
            symbol: symbol,
            side: 'SELL'
        }, (data) => {
            console.log('SELL orders cancelled.');
        });
        await XeggexApi.post('cancelallorders', {
            symbol: symbol,
            side: 'BUY'
        }, (data) => {
            console.log('BUY orders cancelled.');
        });
    }

    static async getMarkets(callback) {
        return XeggexApi.get('market/getlist', callback);
    }

    static async getAssets(callback) {
        return XeggexApi.get('asset/getlist', callback);
    }

    static async getOrderBook(symbol) {
        return XeggexApi.get(`market/orderbook?limit=10&&symbol=` + symbol.replace('/', '_'));
    }
    
    static async getMarketBySymbol(symbol) {
        return XeggexApi.get(`market/getbysymbol/` + symbol.replace('/', '_'));
    }

    static async getBalances() {
        return XeggexApi.get('balances');
    }

    static async getOrders() {
        return XeggexApi.get('account/orders');
    }

    static async post(method, data, callback) {
        const url = XeggexApi.BASE_URL + '/' + method;
        const nonce = Date.now().toString() + Math.random();
        const jsonBodyData = JSON.stringify(data);
        const dataToSign = `${XeggexApi.API_KEY}${url}${jsonBodyData}${nonce}`;
        const signature = crypto.createHmac('sha256', XeggexApi.API_SECRET).update(dataToSign).digest('hex');
        const headers = {
            'X-API-KEY': XeggexApi.API_KEY,
            'X-API-NONCE': nonce,
            'X-API-SIGN': signature,
            'Content-Type': 'application/json'
        };
        try {
            return await axios.post(url, jsonBodyData, {headers});
        } catch (e) {
            console.log(e.response.data);
        }
    }

    static async  get(method, callback) {
        const url = XeggexApi.BASE_URL + '/' + method;
        const nonce = Date.now().toString() + Math.random();
        const dataToSign = `${XeggexApi.API_KEY}${url}${nonce}`;
        const signature = crypto.createHmac('sha256', XeggexApi.API_SECRET).update(dataToSign).digest('hex');
        const headers = {
            'X-API-KEY': XeggexApi.API_KEY,
            'X-API-NONCE': nonce,
            'X-API-SIGN': signature,
            'Content-Type': 'application/json'
        };
        try {
            return await axios.get(url, {headers});
        } catch (e) {
            console.log(e.response.data);
        }
    }
}
;

module.exports = XeggexApi;