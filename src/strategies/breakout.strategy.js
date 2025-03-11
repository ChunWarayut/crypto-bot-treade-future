const BaseStrategy = require('./base.strategy');
const Logger = require('../utils/logger');

class BreakoutStrategy extends BaseStrategy {
  async shouldEnter() {
    try {
      const { high, low, close } = await this.exchange.fetchOHLCV();
      
      const rangeHigh = Math.max(...high.slice(-20));
      const rangeLow = Math.min(...low.slice(-20));
      const currentPrice = close[close.length - 1];
      const previousPrice = close[close.length - 2];

      // Breakout Long
      if (previousPrice <= rangeHigh && currentPrice > rangeHigh) {
        return {
          side: 'buy',
          reason: '🚀 Breakout Long'
        };
      }

      // Breakout Short
      if (previousPrice >= rangeLow && currentPrice < rangeLow) {
        return {
          side: 'sell',
          reason: '💥 Breakout Short'
        };
      }

      return null;
    } catch (error) {
      Logger.error(`Breakout calculation error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = BreakoutStrategy; 