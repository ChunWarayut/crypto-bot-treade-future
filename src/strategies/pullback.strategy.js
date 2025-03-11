const BaseStrategy = require('./base.strategy');
const { EMA } = require('technicalindicators');
const Logger = require('../utils/logger');

class PullbackStrategy extends BaseStrategy {
  async shouldEnter() {
    try {
      const { close } = await this.exchange.fetchOHLCV();
      const emaShort = EMA.calculate({
        values: close,
        period: this.config.indicators.ema.short
      });
      const emaLong = EMA.calculate({
        values: close,
        period: this.config.indicators.ema.long
      });

      const latestPrice = close[close.length - 1];
      const prevPrice = close[close.length - 2];
      const latestEmaShort = emaShort[emaShort.length - 1];
      const latestEmaLong = emaLong[emaLong.length - 1];

      // Long Pullback
      if (
        latestEmaShort > latestEmaLong &&
        prevPrice > latestEmaShort &&
        latestPrice <= latestEmaShort &&
        latestPrice > latestEmaLong
      ) {
        return { 
          side: 'buy', 
          reason: '🔵 Pullback Long' 
        };
      }
      
      // Short Pullback
      if (
        latestEmaShort < latestEmaLong &&
        prevPrice < latestEmaShort &&
        latestPrice >= latestEmaShort &&
        latestPrice < latestEmaLong
      ) {
        return { 
          side: 'sell', 
          reason: '🔴 Pullback Short' 
        };
      }

      return null;
    } catch (error) {
      Logger.error(`Pullback calculation error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = PullbackStrategy; 