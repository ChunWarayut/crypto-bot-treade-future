const ccxt = require("ccxt");
const { EMA, RSI } = require("technicalindicators");
require("dotenv").config();
const googleChatWebhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;

const exchange = new ccxt.binanceusdm({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  enableRateLimit: true,
  options: { defaultType: "future" },
});

const symbol = "BTC/USDT";
const timeframe = "5m";
const tradeAmountUSDT = 5;
const leverage = 25;

async function sendGoogleChatMessage(message) {
  try {
    await axios.post(googleChatWebhookUrl, { text: message });
  } catch (error) {
    console.error(`Google Chat notification failed: ${error.message}`);
  }
}

async function fetchOHLCV() {
  const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, 200);
  return ohlcv.map((c) => ({
    timestamp: c[0],
    close: c[4],
    high: c[2],
    low: c[3],
  }));
}

async function getOpenPosition() {
  const positions = await exchange.fetchPositionsRisk([symbol]);
  return positions.find(
    (p) =>
      p.symbol === symbol.replace("/", "") && parseFloat(p.positionAmt) !== 0
  );
}

async function marketCipherStrategy() {
  const openPosition = await getOpenPosition();
  if (openPosition) {
    console.log("Position already open. Skipping trade.");
    return;
  }

  const ohlcv = await fetchOHLCV();
  const closePrices = ohlcv.map((c) => c.close);
  const highs = ohlcv.map((c) => c.high);
  const lows = ohlcv.map((c) => c.low);

  const ema20 = EMA.calculate({ values: closePrices, period: 20 });
  const ema50 = EMA.calculate({ values: closePrices, period: 50 });
  const rsi = RSI.calculate({ values: closePrices, period: 14 });

  const latestPrice = closePrices[closePrices.length - 1];
  const latestEma20 = ema20[ema20.length - 1];
  const latestEma50 = ema50[ema50.length - 1];
  const latestRsi = rsi[rsi.length - 1];

  const breakoutHigh = Math.max(...highs.slice(-20));
  const breakoutLow = Math.min(...lows.slice(-20));

  if (
    latestPrice > breakoutHigh &&
    latestEma20 > latestEma50 &&
    latestRsi < 70
  ) {
    console.log("🚀 Long Signal Detected");
    // await createMarketOrder("buy");
    await sendGoogleChatMessage(`🚀 Long Signal Detected
    latestPrice: ${latestPrice}
    breakoutHigh: ${breakoutHigh}
    latestEma20: ${latestEma20}
    latestEma50: ${latestEma50}
    latestRsi: ${latestRsi}`);
  } else if (
    latestPrice < breakoutLow &&
    latestEma20 < latestEma50 &&
    latestRsi > 30
  ) {
    console.log("📉 Short Signal Detected");
    // await createMarketOrder("sell");
    await sendGoogleChatMessage(`📉 Short Signal Detected
    latestPrice: ${latestPrice}
    breakoutLow: ${breakoutLow}
    latestEma20: ${latestEma20}
    latestEma50: ${latestEma50}
    latestRsi: ${latestRsi}`);
  } else {
    console.log("No valid signal.", latestPrice < breakoutLow, latestEma20 < latestEma50, latestRsi > 30, "|", latestPrice > breakoutHigh, latestEma20 > latestEma50, latestRsi < 70);
    console.table({
      latestPrice,
      breakoutHigh,
      breakoutLow,
      latestEma20,
      latestEma50,
      latestRsi,
    });
  }
}

async function createMarketOrder(side) {
  const price = await getCurrentPrice();
  let amount = (tradeAmountUSDT * leverage) / price;
  amount = Math.max(0.001, parseFloat(amount.toFixed(3)));

  try {
    const order = await exchange.createMarketOrder(symbol, side, amount);
    console.log(`Order successful: ${order.id}`);
  } catch (error) {
    console.error(`Order failed: ${error.message}`);
  }
}

async function getCurrentPrice() {
  const ticker = await exchange.fetchTicker(symbol);
  return ticker.last;
}

setInterval(marketCipherStrategy, 1000);
