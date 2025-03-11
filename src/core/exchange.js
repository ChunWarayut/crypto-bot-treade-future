const ccxt = require('ccxt');
const Logger = require('../utils/logger');

class ExchangeService {
  constructor(config) {
    this.exchange = new ccxt.binanceusdm({
      apiKey: process.env.API_KEY,
      secret: process.env.API_SECRET,
      enableRateLimit: true,
      options: { 
        defaultType: "future",
        defaultNetwork: "test"
      },
      urls: {
        test: {
          rest: 'https://testnet.binancefuture.com'
        }
      }
    });
    this.config = config;
    this.symbol = config.exchange.symbol;
  }

  async initialize() {
    try {
      // ตั้งค่า leverage
      await this.exchange.fapiPrivatePostLeverage({
        symbol: this.symbol.replace('/', ''),
        leverage: this.config.exchange.leverage
      });
      Logger.trade(`Leverage set to ${this.config.exchange.leverage}x`);

      // ตั้งค่า margin mode
      await this.exchange.fapiPrivatePostMarginType({
        symbol: this.symbol.replace('/', ''),
        marginType: 'ISOLATED'
      });
      Logger.trade('Margin type set to ISOLATED');
    } catch (error) {
      Logger.error(`Initialization error: ${error.message}`);
      throw error;
    }
  }

  async fetchOHLCV() {
    try {
      const ohlcv = await this.exchange.fetchOHLCV(
        this.symbol,
        this.config.exchange.timeframe,
        undefined,
        200
      );

      return {
        timestamp: ohlcv.map(candle => candle[0]),
        open: ohlcv.map(candle => candle[1]),
        high: ohlcv.map(candle => candle[2]),
        low: ohlcv.map(candle => candle[3]),
        close: ohlcv.map(candle => candle[4]),
        volume: ohlcv.map(candle => candle[5])
      };
    } catch (error) {
      Logger.error(`OHLCV fetch error: ${error.message}`);
      throw error;
    }
  }

  async getCurrentPrice() {
    try {
      const ticker = await this.exchange.fetchTicker(this.symbol);
      return ticker.last;
    } catch (error) {
      Logger.error(`Price fetch error: ${error.message}`);
      throw error;
    }
  }

  async getOpenPosition() {
    try {
      const positions = await this.exchange.fetchPositionsRisk([this.symbol]);
      return positions.find(
        p => p.symbol === this.symbol.replace("/", "") && 
        parseFloat(p.positionAmt) !== 0
      );
    } catch (error) {
      Logger.error(`Position fetch error: ${error.message}`);
      throw error;
    }
  }

  async createOrder(type, side, amount, price = undefined, params = {}) {
    try {
      const order = await this.exchange.createOrder(
        this.symbol,
        type,
        side,
        amount,
        price,
        params
      );
      Logger.trade(`Order created: ${JSON.stringify(order)}`);
      return order;
    } catch (error) {
      Logger.error(`Order creation error: ${error.message}`);
      throw error;
    }
  }

  async cancelAllOrders() {
    try {
      await this.exchange.cancelAllOrders(this.symbol);
      Logger.trade('All orders cancelled');
    } catch (error) {
      if (error.code === -2019) {
        Logger.debug('Exchange', 'Orders already canceled');
        return;
      }
      Logger.error(`Order cancellation error: ${error.message}`);
      throw error;
    }
  }

  async getBalance() {
    try {
      const balance = await this.exchange.fetchBalance();
      return balance.USDT.free;
    } catch (error) {
      Logger.error(`Balance fetch error: ${error.message}`);
      throw error;
    }
  }

  async getOpenOrders() {
    try {
      const orders = await this.exchange.fetchOpenOrders(this.symbol);
      return orders;
    } catch (error) {
      Logger.error(`Open orders fetch error: ${error.message}`);
      throw error;
    }
  }

  async cancelOrder(orderId) {
    try {
      await this.exchange.cancelOrder(orderId, this.symbol);
      Logger.trade(`Order ${orderId} cancelled`);
    } catch (error) {
      if (error.code === -2019) {
        Logger.debug('Exchange', `Order ${orderId} already canceled`);
        return;
      }
      Logger.error(`Order cancellation error: ${error.message}`);
      throw error;
    }
  }

  async getOrderStatus(orderId) {
    try {
      const order = await this.exchange.fetchOrder(orderId, this.symbol);
      return order.status;
    } catch (error) {
      Logger.error(`Order status fetch error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = ExchangeService;