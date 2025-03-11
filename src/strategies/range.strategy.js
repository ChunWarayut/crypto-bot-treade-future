const BaseStrategy = require('./base.strategy');
const Logger = require('../utils/logger');

class RangeStrategy extends BaseStrategy {
  async shouldEnter() {
    try {
      const { high, low, close } = await this.exchange.fetchOHLCV();
      
      const rangeHigh = Math.max(...high.slice(-20));
      const rangeLow = Math.min(...low.slice(-20));
      const currentPrice = close[close.length - 1];
      const previousPrice = close[close.length - 2];

      // Range Long (Bounce from bottom)
      if (previousPrice <= rangeLow && currentPrice > rangeLow) {
        return {
          side: 'buy',
          reason: '📈 Range Bottom Bounce'
        };
      }

      // Range Short (Bounce from top)
      if (previousPrice >= rangeHigh && currentPrice < rangeHigh) {
        return {
          side: 'sell',
          reason: '📉 Range Top Bounce'
        };
      }

      return null;
    } catch (error) {
      Logger.error(`Range calculation error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = RangeStrategy; 