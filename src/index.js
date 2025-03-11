require('dotenv').config();
const config = require('./config/trading.config');
const ExchangeService = require('./core/exchange');
const NotificationService = require('./core/notification');
const PositionManager = require('./managers/position.manager');
const { EMAStrategy, PullbackStrategy, RangeStrategy, BreakoutStrategy } = require('./strategies');
const Logger = require('./utils/logger');

class TradingBot {
  constructor() {
    this.exchange = new ExchangeService(config);
    this.notification = new NotificationService();
    this.positionManager = new PositionManager(this.exchange, config);
    
    this.strategies = [
      new EMAStrategy(this.exchange, this.notification, config),
      new PullbackStrategy(this.exchange, this.notification, config),
      new RangeStrategy(this.exchange, this.notification, config),
      new BreakoutStrategy(this.exchange, this.notification, config)
    ];
  }

  async start() {
    Logger.trade('Bot starting...');
    
    // Start strategy execution
    setInterval(() => this._executeStrategies(), config.trading.intervals.analysis);
    
    // Start position management
    setInterval(() => this._managePositions(), config.trading.intervals.trailing);
    
    Logger.trade('Bot started successfully');
  }

  async _executeStrategies() {
    for (const strategy of this.strategies) {
      try {
        await strategy.execute();
      } catch (error) {
        Logger.error(error);
        await this.notification.sendError(error);
      }
    }
  }

  async _managePositions() {
    try {
      await this.positionManager.manageOpenPositions();
    } catch (error) {
      Logger.error(error);
      await this.notification.sendError(error);
    }
  }
}

// Start the bot
const bot = new TradingBot();
bot.start().catch(error => {
  Logger.error(error);
  process.exit(1);
}); 