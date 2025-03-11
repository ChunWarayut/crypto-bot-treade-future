const Logger = require('../utils/logger');

class BaseStrategy {
  constructor(exchange, notification, config) {
    this.exchange = exchange;
    this.notification = notification;
    this.config = config;
    this.name = this.constructor.name;
  }

  async shouldEnter() {
    throw new Error('shouldEnter() must be implemented');
  }

  async execute() {
    try {
      const position = await this.exchange.getOpenPosition();
      if (position) {
        Logger.strategy(this.name, 'Position already open, skipping...');
        return false;
      }

      const signal = await this.shouldEnter();
      if (signal) {
        Logger.strategy(this.name, `Signal detected: ${signal.reason}`);
        await this.enterPosition(signal);
        return true;
      }

      Logger.strategy(this.name, 'No entry signal');
      return false;
    } catch (error) {
      Logger.error(`${this.name} execution error: ${error.message}`);
      throw error;
    }
  }

  async enterPosition(signal) {
    try {
      const { side, reason } = signal;
      const currentPrice = await this.exchange.getCurrentPrice();
      const amount = this.calculatePositionSize(currentPrice);

      // Create market order
      const order = await this.exchange.createOrder(
        'market',
        side,
        amount
      );

      // ถ้า margin ไม่พอ ให้ข้ามไปเงียบๆ ไม่ต้องส่ง notification
      if (!order) {
        Logger.strategy(this.name, 'Insufficient margin, skipping trade');
        return;
      }

      // ถ้าสำเร็จค่อยแจ้งเตือน
      await this.notification.send(`${reason} - Opening ${side.toUpperCase()} Position`);
      Logger.trade(`Order placed: ${order.id}`);
      await this.notification.send(`Order successful: ${order.id}`);

      // Set TP/SL
      await this.setTPSL({
        side,
        amount,
        entryPrice: currentPrice
      });

    } catch (error) {
      // ตรวจสอบ error จาก Binance
      if (error.message && error.message.includes('"code":-2019')) {
        Logger.strategy(this.name, 'Insufficient margin, skipping trade');
        return;
      }
      
      Logger.error(`Position entry error: ${error.message}`);
      await this.notification.sendError(`Order failed: ${error.message}`);
      throw error;
    }
  }

  calculatePositionSize(currentPrice) {
    const amount = (this.config.trading.amount * this.config.exchange.leverage) / currentPrice;
    return Math.max(0.001, parseFloat(amount.toFixed(3)));
  }

  async setTPSL(position) {
    try {
      const { side, amount, entryPrice } = position;
      const config = this.config.riskManagement;

      const tpPrice = side === 'buy' 
        ? entryPrice * (1 + config.tp.long)
        : entryPrice * (1 + config.tp.short);

      const slPrice = side === 'buy'
        ? entryPrice * (1 + config.sl.long)
        : entryPrice * (1 + config.sl.short);

      // Take Profit Order
      await this.exchange.createOrder(
        'TAKE_PROFIT_MARKET',
        side === 'buy' ? 'sell' : 'buy',
        amount,
        undefined,
        { stopPrice: tpPrice, closePosition: true }
      );

      // Stop Loss Order
      await this.exchange.createOrder(
        'STOP_MARKET',
        side === 'buy' ? 'sell' : 'buy',
        amount,
        undefined,
        { stopPrice: slPrice, closePosition: true }
      );

      Logger.trade(`TP/SL set - TP: ${tpPrice}, SL: ${slPrice}`);

    } catch (error) {
      Logger.error(`TP/SL setting error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = BaseStrategy; 