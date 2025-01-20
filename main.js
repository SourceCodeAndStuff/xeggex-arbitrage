#!/usr/bin/env node
const Asset = require('./model/Asset.js');
const Route = require('./model/Route.js');
const Market = require('./model/Market.js');
const Balance = require('./model/Balance.js');
var XeggexApi = require('./xeggex/XeggexApi.js');
const greenlock = require('greenlock-express');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
var io;

app.use('/css', express.static(__dirname + '/node_modules/bootstrap/dist/css'));
app.use('/js', express.static(__dirname + '/node_modules/socket.io/client-dist/'));
app.use('/js', express.static(__dirname + '/node_modules/bootstrap/dist/js'));

app.use('/', (req, res) => {
    res.sendFile(__dirname + '/view/index.html');
});


setInterval(() => {
    try {
        io.emit('balances', logBalances());
        io.emit('routes', logRoutes());
        io.emit('summary', logSummary());
    } catch (e) {

    }
}, 300);
server.listen(80, () => {
    console.log('listening on *:80');
});

greenlock.init({
    packageRoot: __dirname,
    configDir: './greenlock.d',
    maintainerEmail: 'your-email@example.com',
    cluster: false,
    notify: function (event, details) {
        if ("error" === event) {
            console.error('greenlock notify :' + event, details);
        }
    },
})
        .ready(handleSocket)
        .serve(app);

function handleSocket(glx) {
    io = socketIo(glx.httpsServer());
}

async function init() {
    await Market.getList();
    await Asset.getList();
    await Balance.getList();
    await Route.find();

    for (var i in Asset.usedMarkets) {
        await Asset.usedMarkets[i].getOrderBook();
        await Asset.usedMarkets[i].getMinimumQuantity();
        await sleep(30);
    }

    await checkAndRebalanceBalances();
    
    run();
}

setInterval(checkAndRebalanceBalances, 15 * 60 * 1000);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkAndRebalanceBalances() {
    if (Route.trading) {
        setTimeout(async () => {
            await checkAndRebalanceBalances();
        }, 10000);
        return;
    }
    try {
        const tolerance = 0.5;
        var totalValueInUsdt = 0;
        var balances = [];
        var balanced = true;
        var balancePercentage = 100 / Asset.allowed.length;

        await Balance.getList();

        for (var i in Asset.allowed) {
            balances[i] = {};
            balances[i].balance = Balance.list[Asset.allowed[i]];
            balances[i].usdtValue = balances[i].balance.tradeableInUsdt();
            totalValueInUsdt += balances[i].usdtValue;
        }

        for (var i in Asset.allowed) {
            balances[i].usdtPercentage = (balances[i].usdtValue / totalValueInUsdt) * 100;
            if (Math.abs(balances[i].usdtPercentage - balancePercentage) >= tolerance) {
                balanced = false;
            }
        }

        if (!balanced) {
            console.log('Balancing...');
            Balance.balancing = true;
            balances.sort((a, b) => b.usdtValue - a.usdtValue);

            const most = balances[0];
            const least = balances[balances.length - 1];

            var markets = [];

            var orders = await XeggexApi.getOrders();
            for (var i in orders.data) {
                markets[orders.data[i].symbol] = Market.list[orders.data[i].symbol];
            }

            for (var i in markets) {
                await markets[i].cancelAllOrders();
                await sleep(300);
            }

            const amountToTradeUsdt = (most.usdtValue - least.usdtValue) / 2;
            var minTrade = 0.01;
            if (most.balance.asset === 'BTC' || least.balance.asset === 'BTC') {
                minTrade = Asset.list['BTC'].convertToUsdt(0.00001);
            }
            if (most.balance.asset === 'ETH' || least.balance.asset === 'ETH') {
                if (Asset.list['ETH'].convertToUsdt(0.0001) > minTrade) {
                    minTrade = Asset.list['ETH'].convertToUsdt(0.0001);
                }
            }

            if (amountToTradeUsdt > minTrade) {
                var directMarket = Market.find(most.balance.asset, least.balance.asset);

                if (directMarket) {
                    // trade directly
                    if (directMarket.isBaseAsset(most.balance.asset)) {
                        // sell
                        var amount = Asset.list[most.balance.asset].convertFromUsdt(amountToTradeUsdt);
                        await XeggexApi.placeOrder('sell', directMarket.symbol, directMarket.orderBook.bids[0].price, amount);
                    } else {
                        // buy
                        var amount = Asset.list[least.balance.asset].convertFromUsdt(amountToTradeUsdt);
                        await XeggexApi.placeOrder('buy', directMarket.symbol, directMarket.orderBook.asks[0].price, amount);
                    }
                } else {
                    // convert through USDT
                    console.log("Convert through USDT");
                    var usdtMarketMost = Market.find(most.balance.asset, 'USDT');
                    var usdtMarketLeast = Market.find(least.balance.asset, 'USDT');

                    if (usdtMarketMost.isBaseAsset(most.balance.asset)) {
                        // buy
                        var amount = Asset.list[most.balance.asset].convertFromUsdt(amountToTradeUsdt);
                        await XeggexApi.placeOrder('sell', usdtMarketMost.symbol, parseFloat(usdtMarketMost.orderBook.asks[0].price).toFixed(usdtMarketMost.priceDecimals), parseFloat(amount).toFixed(usdtMarketMost.quantityDecimals));
                    } else {
                        // sell
                        var amount = amountToTradeUsdt;
                        await XeggexApi.placeOrder('buy', usdtMarketMost.symbol, parseFloat(usdtMarketMost.orderBook.bids[0].price).toFixed(usdtMarketMost.priceDecimals), parseFloat(amount).toFixed(usdtMarketMost.quantityDecimals));
                    }
                    await sleep(100);

                    if (usdtMarketLeast.isBaseAsset(least.balance.asset)) {
                        // buy
                        var amount = Asset.list[least.balance.asset].convertFromUsdt(amountToTradeUsdt);
                        await XeggexApi.placeOrder('buy', usdtMarketLeast.symbol, parseFloat(usdtMarketLeast.orderBook.asks[0].price).toFixed(usdtMarketLeast.priceDecimals), parseFloat(amount).toFixed(usdtMarketLeast.quantityDecimals));
                    } else {
                        // sell
                        var amount = amountToTradeUsdt;
                        await XeggexApi.placeOrder('sell', usdtMarketLeast.symbol, parseFloat(usdtMarketLeast.orderBook.bids[0].price).toFixed(usdtMarketLeast.priceDecimals), parseFloat(amount).toFixed(usdtMarketLeast.quantityDecimals));
                    }
                }
                setTimeout(async () => {
                    await checkAndRebalanceBalances();
                }, 1000);
            } else {
                Balance.balancing = false;
            }

        } else {
            Balance.balancing = false;
        }
    } catch (error) {
        console.error('Error checking and rebalancing balances (retrying in 1s...):', error.response ? error.response.data : error.message);
        setTimeout(async () => {
            await checkAndRebalanceBalances();
        }, 1000);
    }
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

var balancesStart = [];
var start = true;
var totalValueInUsdtStart = 0;
function logBalances() {
    var totalValueInUsdt = 0;
    totalValueInUsdtStart = 0;
    var balances = [];
    var str = '';

    for (var i in Asset.allowed) {
        balances[i] = {};
        balances[i].balance = Balance.list[Asset.allowed[i]];
        balances[i].usdtValue = balances[i].balance.tradeableInUsdt();
        totalValueInUsdt += balances[i].usdtValue;
        if (start) {
            balancesStart[i] = balances[i];
        }
        totalValueInUsdtStart += balancesStart[i].balance.getAsset().convertToUsdt(parseFloat(balancesStart[i].balance.available) + parseFloat(balancesStart[i].balance.held));
    }

    start = false;

    for (var i in Asset.allowed) {
        balances[i].usdtPercentage = (balances[i].usdtValue / totalValueInUsdt) * 100;
    }


    str += '<table class="table">' +
            '<tr>' +
            '<th>Asset</th>' +
            '<th class="text-end">Available</th>' +
            '<th class="text-end">Held</th>' +
            '<th class="text-end">Total</th>' +
            '<th class="text-end">Start</th>' +
            '<th class="text-end">Profit</th>' +
            '<th class="text-end">ROI</th>' +
            '<th class="text-end">USDT Value</th>' +
            '<th class="text-end">Balance %</th>' +
            '</tr>';

    var roiTotal = 0;

    for (var i in Asset.allowed) {

        var total = parseFloat(balances[i].balance.held) + parseFloat(balances[i].balance.available);
        var totalStart = parseFloat(balancesStart[i].balance.held) + parseFloat(balancesStart[i].balance.available);
        var profit = total - totalStart;
        var roi = profit / totalStart * 100;
        roiTotal += roi;
        str += `<tr>` +
                `<td>${Asset.allowed[i]}</td>` +
                `<td class="text-end">${(parseFloat(balances[i].balance.available).toFixed(8))}</td>` +
                `<td class="text-end">${(parseFloat(balances[i].balance.held).toFixed(8))}</td>` +
                `<td class="text-end">${total.toFixed(8)}</td>` +
                `<td class="text-end">${totalStart.toFixed(8)}</td>` +
                `<td class="text-end">${addPlusOrSpace(profit.toFixed(8))}</td>` +
                `<td class="text-end">${addPlusOrSpace(roi.toFixed(4))}%</td>` +
                `<td class="text-end">\$${balances[i].usdtValue.toFixed(2)}</td>` +
                `<td class="text-end">${balances[i].usdtPercentage.toFixed(2)}%</td>` +
                `</tr>`;
    }
    roiTotal = roiTotal / Asset.allowed.length;
    var usdtProfit = totalValueInUsdt - totalValueInUsdtStart;
    var usdtRoi = usdtProfit / totalValueInUsdtStart * 100;
    str += '<tr>' +
            '<td>(' + Asset.allowed.length + ')</td>' +
            '<td></td>' +
            '<th class="text-end">USDT:</th>' +
            '<td class="text-end">$' + totalValueInUsdt.toFixed(8) + '</td>' +
            '<td class="text-end">$' + totalValueInUsdtStart.toFixed(8) + '</td>' +
            '<td class="text-end">$' + addPlusOrSpace(usdtProfit.toFixed(8)) + '</td>' +
            '<td class="text-end">' + addPlusOrSpace(usdtRoi.toFixed(4)) + '%</td>' +
            '<td></td>' +
            '<td></td>' +
            '</tr>';
    str += '</table>';
    return str;
}

const startTime = new Date();

function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function getTimeDifference(start, end) {
    const diff = end - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

var startedAt = new Date();
function logSummary() {
    var totalValueInUsdt = 0;
    var balances = [];
    var str = '<div class="row">';

    for (var i in Asset.allowed) {
        balances[i] = {};
        balances[i].balance = Balance.list[Asset.allowed[i]];
        balances[i].usdtValue = balances[i].balance.tradeableInUsdt();
        totalValueInUsdt += balances[i].usdtValue;
    }

    for (var i in Asset.allowed) {
        balances[i].usdtPercentage = (balances[i].usdtValue / totalValueInUsdt) * 100;
    }

    const now = new Date();

    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const year = now.getFullYear();

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const formattedDate = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    str += '<div class="row"><div class="col-4"><h3>' + formattedDate + '</h3><h4>Time running: ' + getTimeDifference(startedAt, now) + '</h4></div><div class="col-4 text-center"><h3>USDT total: <br>$' + totalValueInUsdt.toFixed(8) + '</h3></div><div class="col-4 text-end"><h3>Arbs: ' + Route.trades + '</h3><h4>Trades: ' + Route.trades * 3 + '</h4></div></div>';
    return str;
}


function logRoutes() {
    var str = '<table class="table">' +
            '<tr>' +
            '<th>Route</th>' +
            '<th class="text-center">X</th>' +
            '<th class="text-center">Y</th>' +
            '<th class="text-center">Z</th>' +
            '<th class="text-end">ROI</th>' +
            '</tr>';
    for (var i in Route.list) {
        str += '<tr>' + Route.list[i].html() + '</tr>';
    }
    return str + '</table>';
}

async function run() {
    try {
        await Balance.getList();
        
        for (var i in Asset.usedMarkets) {
            await Asset.usedMarkets[i].getOrderBook();
        }
    } catch (e) {
        console.log(e.message);
    }
    run();
}

init();
