const BaseStrategy = require('./base.strategy');
const { EMA } = require('technicalindicators');
const Logger = require('../utils/logger');

class EMAStrategy extends BaseStrategy {
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

      const latestEmaShort = emaShort[emaShort.length - 1];
      const latestEmaLong = emaLong[emaLong.length - 1];

      if (latestEmaShort > latestEmaLong) {
        return { 
          side: 'buy', 
          reason: '✅ EMA Uptrend' 
        };
      } else if (latestEmaShort < latestEmaLong) {
        return { 
          side: 'sell', 
          reason: '✅ EMA Downtrend' 
        };
      }

      return null;
    } catch (error) {
      Logger.error(`EMA calculation error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = EMAStrategy; 