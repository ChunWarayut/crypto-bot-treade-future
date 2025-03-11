const ccxt = require('ccxt');
require('dotenv').config();

class ExchangeService {
  constructor(config) {
    this.exchange = new ccxt.binanceusdm({
      apiKey: process.env.API_KEY,
      secret: process.env.API_SECRET,
      enableRateLimit: true,
      options: { defaultType: "future" }
    });
    this.config = config;
  }

  async fetchOHLCV() {
    const ohlcv = await this.exchange.fetchOHLCV(
      this.config.symbol, 
      this.config.timeframe, 
      undefined, 
      200
    );
    return ohlcv.map(candle => candle[4]);
  }

  async getCurrentPrice() {
    const ticker = await this.exchange.fetchTicker(this.config.symbol);
    return ticker.last;
  }

  // ... other exchange related methods
}

module.exports = ExchangeService; 