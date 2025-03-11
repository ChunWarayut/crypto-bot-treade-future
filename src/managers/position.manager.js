const Logger = require('../utils/logger');

class PositionManager {
  constructor(exchange, config) {
    this.exchange = exchange;
    this.config = config;
  }

  async manageOpenPositions() {
    const position = await this.exchange.getOpenPosition();
    if (!position) return;

    await this.trailingStopLoss(position);
  }

  async trailingStopLoss(position) {
    try {
      const entryPrice = parseFloat(position.entryPrice);
      const positionAmt = parseFloat(position.positionAmt);
      const side = positionAmt > 0 ? 'buy' : 'sell';
      const amount = Math.abs(positionAmt);
      const currentPrice = await this.exchange.getCurrentPrice();

      let newTP, newSL;

      // คำนวณ TP/SL ใหม่สำหรับ Long Position
      if (side === 'buy' && currentPrice > entryPrice) {
        newTP = currentPrice * (1 + this.config.riskManagement.tp.long);
        newSL = currentPrice * (1 + this.config.riskManagement.sl.long);
        // ป้องกันไม่ให้ SL ต่ำกว่าราคาเข้า
        if (newSL < entryPrice) newSL = entryPrice;
      } 
      // คำนวณ TP/SL ใหม่สำหรับ Short Position
      else if (side === 'sell' && currentPrice < entryPrice) {
        newTP = currentPrice * (1 + this.config.riskManagement.tp.short);
        newSL = currentPrice * (1 + this.config.riskManagement.sl.short);
        // ป้องกันไม่ให้ SL สูงกว่าราคาเข้า
        if (newSL > entryPrice) newSL = entryPrice;
      } else {
        return; // ไม่มีการอัพเดท TP/SL
      }

      // ยกเลิก Orders เดิมทั้งหมด
      await this.exchange.cancelAllOrders();

      // สร้าง Take Profit Order ใหม่
      await this.exchange.createOrder(
        'TAKE_PROFIT_MARKET',
        side === 'buy' ? 'sell' : 'buy',
        amount,
        undefined,
        { 
          stopPrice: parseFloat(newTP.toFixed(1)), 
          closePosition: true 
        }
      );

      // สร้าง Stop Loss Order ใหม่
      await this.exchange.createOrder(
        'STOP_MARKET',
        side === 'buy' ? 'sell' : 'buy',
        amount,
        undefined,
        { 
          stopPrice: parseFloat(newSL.toFixed(1)), 
          closePosition: true 
        }
      );

      Logger.position(
        `Trailing TP/SL updated - Side: ${side.toUpperCase()}, ` +
        `TP: ${newTP.toFixed(1)}, SL: ${newSL.toFixed(1)}`
      );

    } catch (error) {
      Logger.error(`Trailing stop loss error: ${error.message}`);
      throw error;
    }
  }

  async _calculateOptimalTPSL(side, price) {
    const config = this.config.riskManagement;
    return {
      tp: side === 'buy' 
        ? price * (1 + config.tp.long)
        : price * (1 + config.tp.short),
      sl: side === 'buy'
        ? price * (1 + config.sl.long)
        : price * (1 + config.sl.short)
    };
  }
}

module.exports = PositionManager; 