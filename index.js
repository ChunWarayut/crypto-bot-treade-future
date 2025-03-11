const ccxt = require("ccxt");
const axios = require("axios");
const { EMA } = require("technicalindicators");
require("dotenv").config();

const exchange = new ccxt.binanceusdm({
  apiKey: process.env.API_KEY,
  secret: process.env.API_SECRET,
  enableRateLimit: true,
  options: { defaultType: "future" },
});

const symbol = "BTC/USDT";
const timeframe = "1m"; // 1-minute timeframe
const tradeAmountUSDT = 5; // Amount in USDT per trade
const leverage = 50;
const googleChatWebhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;

// Constants
const TRADING_CONFIG = {
  symbol: "BTC/USDT",
  timeframe: "1m",
  tradeAmountUSDT: 5,
  leverage: 50,
  intervals: {
    analysis: 5000,
    trailing: 1000
  },
  tp: {
    long: 0.002,  // 0.2%
    short: -0.002
  },
  sl: {
    long: -0.001, // 0.1%
    short: 0.001
  }
};

async function fetchOHLCV() {
  const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, 200);
  const close = ohlcv.map((candle) => candle[4]);
  return close;
}

async function getOpenPosition() {
  const positions = await exchange.fetchPositionsRisk([symbol]);
  console.log(positions);
  return positions.find(
    (p) => p.symbol === symbol.replace("/", "") && parseFloat(p.positionAmt) !== 0
  );
}

async function analyzeAndTrade() {
  const openPosition = await getOpenPosition();
  if (openPosition) {
    console.log("Position is already open. Skipping trade.");
    return;
  }

  const closePrices = await fetchOHLCV();
  const emaShort = EMA.calculate({ values: closePrices, period: 20 });
  const emaLong = EMA.calculate({ values: closePrices, period: 50 });

  const latestEmaShort = emaShort[emaShort.length - 1];
  const latestEmaLong = emaLong[emaLong.length - 1];

  if (latestEmaShort > latestEmaLong) {
    await sendGoogleChatMessage("✅ Uptrend detected - Opening Long Position");
    await createMarketOrder("buy");
  } else if (latestEmaShort < latestEmaLong) {
    await sendGoogleChatMessage("✅ Downtrend detected - Opening Short Position");
    await createMarketOrder("sell");
  } else {
    console.log("❌ No clear trend");
  }
}

async function createMarketOrder(side) {
  const price = await getCurrentPrice();
  let amount = (tradeAmountUSDT * leverage) / price;

  amount = Math.max(0.001, parseFloat(amount.toFixed(3)));

  try {
    const order = await exchange.createMarketOrder(symbol, side, amount);

    await setTPandSL(side, amount, price);

    await sendGoogleChatMessage(`Order successful: ${order.id}`);
    console.log(`Order successful: ${order.id}`);
  } catch (error) {
    console.error(`Order failed: ${error.message}`);
  }
}

async function setTPandSL(side, amount, entryPrice) {
  const tpPrice = side === "buy" ? entryPrice * (1 + 0.002) : entryPrice * (1 - 0.002);
  const slPrice = side === "buy" ? entryPrice * (1 - 0.001) : entryPrice * (1 + 0.001);

  await exchange.createOrder(
    symbol,
    "TAKE_PROFIT_MARKET",
    side === "buy" ? "sell" : "buy",
    amount,
    undefined,
    { stopPrice: tpPrice, closePosition: true }
  );

  await exchange.createOrder(
    symbol,
    "STOP_MARKET",
    side === "buy" ? "sell" : "buy",
    amount,
    undefined,
    { stopPrice: slPrice, closePosition: true }
  );

  console.log(`Initial TP and SL set: TP=${tpPrice}, SL=${slPrice}`);
  adjustTPSLContinuously(side, amount, price);
}

async function adjustTPSLContinuously(side, amount, entryPrice) {
  const adjustInterval = setInterval(async () => {
    const position = await getOpenPosition();
    if (!position) return;

    const currentPrice = await getCurrentPrice();
    let newTP, newSL;

    if (side === "buy" && currentPrice > entryPrice) {
      newTP = currentPrice * (1 + 0.002);
      newSL = currentPrice * (1 - 0.001);
    } else if (side === "sell" && currentPrice < entryPrice) {
      newTP = currentPrice * (1 - 0.002);
      newSL = currentPrice * (1 + 0.001);
    } else {
      return;
    }

    await exchange.cancelAllOrders(symbol);

    await exchange.createOrder(
      symbol,
      "TAKE_PROFIT_MARKET",
      side === "buy" ? "sell" : "buy",
      amount,
      undefined,
      { stopPrice: newTP, closePosition: true }
    );

    await exchange.createOrder(
      symbol,
      "STOP_MARKET",
      side === "buy" ? "sell" : "buy",
      amount,
      undefined,
      { stopPrice: newSL, closePosition: true }
    );

    console.log(`TP and SL adjusted: TP=${newTP}, SL=${newSL}`);
  }, 1000);
}

async function getCurrentPrice() {
  const ticker = await exchange.fetchTicker(symbol);
  return ticker.last;
}

async function sendGoogleChatMessage(message) {
  try {
    await axios.post(googleChatWebhookUrl, { text: message });
  } catch (error) {
    console.error(`Google Chat notification failed: ${error.message}`);
  }
}
// เพิ่ม Trailing Stop Loss
async function trailingStopLoss() {
  const position = await getOpenPosition();
  if (!position) return;

  const entryPrice = parseFloat(position.entryPrice);
  const positionAmt = parseFloat(position.positionAmt);
  const side = positionAmt > 0 ? 'buy' : 'sell';
  const amount = Math.abs(positionAmt);
  const currentPrice = await getCurrentPrice();

  let newTP, newSL;

  if (side === 'buy' && currentPrice > entryPrice) {
    newTP = currentPrice * (1 + 0.002);
    newSL = currentPrice * (1 - 0.001);
    if (newSL < entryPrice) newSL = entryPrice;
  } else if (side === 'sell' && currentPrice < entryPrice) {
    newTP = currentPrice * (1 - 0.002);
    newSL = currentPrice * (1 + 0.001);
    if (newSL > entryPrice) newSL = entryPrice;
  } else {
    return;
  }

  await exchange.cancelAllOrders(symbol);

  await exchange.createOrder(
    symbol,
    "TAKE_PROFIT_MARKET",
    side === "buy" ? "sell" : "buy",
    amount,
    undefined,
    { stopPrice: parseFloat(newTP.toFixed(1)), closePosition: true }
  );

  await exchange.createOrder(
    symbol,
    "STOP_MARKET",
    side === "buy" ? "sell" : "buy",
    amount,
    undefined,
    { stopPrice: parseFloat(newSL.toFixed(1)), closePosition: true }
  );

  console.log(`🔄 Trailing TP & SL adjusted: TP=${newTP.toFixed(1)}, SL=${newSL.toFixed(1)}`);
}
async function pullbackStrategy() {
  const openPosition = await getOpenPosition();
  if (openPosition) {
    console.log("Position already open. Skipping pullback trade.");
    return;
  }

  const closePrices = await fetchOHLCV();
  const emaShort = EMA.calculate({ values: closePrices, period: 20 });
  const emaLong = EMA.calculate({ values: closePrices, period: 50 });

  const latestPrice = closePrices[closePrices.length - 1];
  const prevPrice = closePrices[closePrices.length - 2];
  const latestEmaShort = emaShort[emaShort.length - 1];
  const latestEmaLong = emaLong[emaLong.length - 1];

  // Check Long Pullback Condition
  if (
    latestEmaShort > latestEmaLong &&
    prevPrice > latestEmaShort &&
    latestPrice <= latestEmaShort &&
    latestPrice > latestEmaLong
  ) {
    console.log("🔵 Pullback Long detected");
    await sendGoogleChatMessage("🔵 Pullback detected - Entering Long position");
    await createMarketOrder("buy");
  }
  // Pullback Short Condition
  else if (
    latestEmaShort < latestEmaLong &&
    prevPrice < latestEmaShort &&
    latestPrice > latestEmaShort &&
    latestPrice < latestEmaLong
  ) {
    console.log("🔴 Pullback Short detected");
    await sendGoogleChatMessage("🔴 Pullback detected - Entering Short position");
    await createMarketOrder("sell");
  } else {
    console.log("No pullback condition met");
  }
}

async function rangeStrategy() {
  const openPosition = await getOpenPosition();
  if (openPosition) {
    console.log("Position already open. Skipping range trade.");
    return;
  }

  const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, 20);
  const highs = ohlcv.map((candle) => candle[2]);
  const lows = ohlcv.map((candle) => candle[3]);
  const closes = ohlcv.map((candle) => candle[4]);

  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const currentPrice = closes[closes.length - 1];
  const previousPrice = closes[closes.length - 2];

  // เข้า Long เมื่อราคาชนขอบล่างแล้วดีดขึ้น
  if (previousPrice <= rangeLow && currentPrice > rangeLow) {
    console.log("📈 Range Long detected");
    await sendGoogleChatMessage("📈 Range Strategy - Entering Long position");
    await createMarketOrder("buy");
  }
  // เข้า Short เมื่อราคาชนขอบบนแล้วดีดลง
  else if (previousPrice >= rangeHigh && currentPrice < rangeHigh) {
    console.log("📉 Range Short detected");
    await sendGoogleChatMessage("📉 Range Strategy - Entering Short position");
    await createMarketOrder("sell");
  } else {
    console.log("No range conditions met");
  }
}
async function breakoutStrategy() {
  const openPosition = await getOpenPosition();
  if (openPosition) {
    console.log("Position already open. Skipping breakout trade.");
    return;
  }

  const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, 20);
  const highs = ohlcv.map((candle) => candle[2]);
  const lows = ohlcv.map((candle) => candle[3]);
  const closes = ohlcv.map((candle) => candle[4]);

  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const currentPrice = closes[closes.length - 1];
  const previousPrice = closes[closes.length - 2];

  // เข้า Long เมื่อราคาทะลุขึ้นเหนือขอบบน
  if (previousPrice <= rangeHigh && currentPrice > rangeHigh) {
    console.log("🚀 Breakout Long detected");
    await sendGoogleChatMessage("🚀 Breakout detected - Entering Long position");
    await createMarketOrder("buy");
  }
  // เข้า Short เมื่อราคาทะลุลงต่ำกว่าขอบล่าง
  else if (previousPrice >= rangeLow && currentPrice < rangeLow) {
    console.log("📉 Breakout Short detected");
    await sendGoogleChatMessage("📉 Breakout detected - Entering Short position");
    await createMarketOrder("sell");
  } else {
    console.log("No breakout conditions met");
  }
}

// Refactored strategy execution
class TradingStrategy {
  constructor(exchange, config) {
    this.exchange = exchange;
    this.config = config;
  }

  async executeStrategies() {
    const position = await getOpenPosition();
    if (position) {
      console.log("Position already open. Skipping trade analysis.");
      return;
    }

    await Promise.all([
      this.executeEMAStrategy(),
      this.executePullbackStrategy(),
      this.executeRangeStrategy(),
      this.executeBreakoutStrategy()
    ]);
  }

  async executeEMAStrategy() {
    const closePrices = await fetchOHLCV();
    const emaShort = EMA.calculate({ values: closePrices, period: 20 });
    const emaLong = EMA.calculate({ values: closePrices, period: 50 });

    const latestEmaShort = emaShort[emaShort.length - 1];
    const latestEmaLong = emaLong[emaLong.length - 1];

    if (latestEmaShort > latestEmaLong) {
      await sendGoogleChatMessage("✅ Uptrend detected - Opening Long Position");
      await createMarketOrder("buy");
    } else if (latestEmaShort < latestEmaLong) {
      await sendGoogleChatMessage("✅ Downtrend detected - Opening Short Position");
      await createMarketOrder("sell");
    } else {
      console.log("❌ No clear trend");
    }
  }

  async executePullbackStrategy() {
    const openPosition = await getOpenPosition();
    if (openPosition) {
      console.log("Position already open. Skipping pullback trade.");
      return;
    }

    const closePrices = await fetchOHLCV();
    const emaShort = EMA.calculate({ values: closePrices, period: 20 });
    const emaLong = EMA.calculate({ values: closePrices, period: 50 });

    const latestPrice = closePrices[closePrices.length - 1];
    const prevPrice = closePrices[closePrices.length - 2];
    const latestEmaShort = emaShort[emaShort.length - 1];
    const latestEmaLong = emaLong[emaLong.length - 1];

    // Check Long Pullback Condition
    if (
      latestEmaShort > latestEmaLong &&
      prevPrice > latestEmaShort &&
      latestPrice <= latestEmaShort &&
      latestPrice > latestEmaLong
    ) {
      console.log("🔵 Pullback Long detected");
      await sendGoogleChatMessage("🔵 Pullback detected - Entering Long position");
      await createMarketOrder("buy");
    }
    // Pullback Short Condition
    else if (
      latestEmaShort < latestEmaLong &&
      prevPrice < latestEmaShort &&
      latestPrice > latestEmaShort &&
      latestPrice < latestEmaLong
    ) {
      console.log("🔴 Pullback Short detected");
      await sendGoogleChatMessage("🔴 Pullback detected - Entering Short position");
      await createMarketOrder("sell");
    } else {
      console.log("No pullback condition met");
    }
  }

  async executeRangeStrategy() {
    const openPosition = await getOpenPosition();
    if (openPosition) {
      console.log("Position already open. Skipping range trade.");
      return;
    }

    const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, 20);
    const highs = ohlcv.map((candle) => candle[2]);
    const lows = ohlcv.map((candle) => candle[3]);
    const closes = ohlcv.map((candle) => candle[4]);

    const rangeHigh = Math.max(...highs);
    const rangeLow = Math.min(...lows);
    const currentPrice = closes[closes.length - 1];
    const previousPrice = closes[closes.length - 2];

    // เข้า Long เมื่อราคาชนขอบล่างแล้วดีดขึ้น
    if (previousPrice <= rangeLow && currentPrice > rangeLow) {
      console.log("📈 Range Long detected");
      await sendGoogleChatMessage("📈 Range Strategy - Entering Long position");
      await createMarketOrder("buy");
    }
    // เข้า Short เมื่อราคาชนขอบบนแล้วดีดลง
    else if (previousPrice >= rangeHigh && currentPrice < rangeHigh) {
      console.log("📉 Range Short detected");
      await sendGoogleChatMessage("📉 Range Strategy - Entering Short position");
      await createMarketOrder("sell");
    } else {
      console.log("No range conditions met");
    }
  }

  async executeBreakoutStrategy() {
    const openPosition = await getOpenPosition();
    if (openPosition) {
      console.log("Position already open. Skipping breakout trade.");
      return;
    }

    const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, 20);
    const highs = ohlcv.map((candle) => candle[2]);
    const lows = ohlcv.map((candle) => candle[3]);
    const closes = ohlcv.map((candle) => candle[4]);

    const rangeHigh = Math.max(...highs);
    const rangeLow = Math.min(...lows);
    const currentPrice = closes[closes.length - 1];
    const previousPrice = closes[closes.length - 2];

    // เข้า Long เมื่อราคาทะลุขึ้นเหนือขอบบน
    if (previousPrice <= rangeHigh && currentPrice > rangeHigh) {
      console.log("🚀 Breakout Long detected");
      await sendGoogleChatMessage("🚀 Breakout detected - Entering Long position");
      await createMarketOrder("buy");
    }
    // เข้า Short เมื่อราคาทะลุลงต่ำกว่าขอบล่าง
    else if (previousPrice >= rangeLow && currentPrice < rangeLow) {
      console.log("📉 Breakout Short detected");
      await sendGoogleChatMessage("📉 Breakout detected - Entering Short position");
      await createMarketOrder("sell");
    } else {
      console.log("No breakout conditions met");
    }
  }
}

// Position Management
class PositionManager {
  constructor(exchange, config) {
    this.exchange = exchange;
    this.config = config;
  }

  async setTPSL(side, amount, entryPrice) {
    const { tp, sl } = this.calculateTPSLLevels(side, entryPrice);
    await this.createTPSLOrders(side, amount, tp, sl);
    console.log(`Initial TP & SL set: TP=${tp}, SL=${sl}`);
  }

  async trailingStopLoss() {
    const position = await getOpenPosition();
    if (!position) return;

    const { side, amount, entryPrice } = this.getPositionDetails(position);
    const currentPrice = await getCurrentPrice();
    
    const { tp, sl } = this.calculateTrailingLevels(side, currentPrice, entryPrice);
    if (!tp || !sl) return;

    await this.updateTPSLOrders(side, amount, tp, sl);
  }

  // ... helper methods ...
}

// Initialize and start trading
async function initializeTrading() {
  const trader = new TradingStrategy(exchange, TRADING_CONFIG);
  const positionManager = new PositionManager(exchange, TRADING_CONFIG);

  // Start strategy execution
  setInterval(() => trader.executeStrategies(), TRADING_CONFIG.intervals.analysis);
  
  // Start trailing stop loss
  setInterval(() => positionManager.trailingStopLoss(), TRADING_CONFIG.intervals.trailing);
}

// Error handling wrapper
const withErrorHandling = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    console.error(`Error in ${fn.name}:`, error.message);
    await sendGoogleChatMessage(`❌ Error: ${error.message}`);
    throw error;
  }
};

// Start trading with error handling
initializeTrading().catch(console.error);