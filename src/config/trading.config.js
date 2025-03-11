module.exports = {
  exchange: {
    symbol: "BTC/USDT",
    timeframe: "5m",
    leverage: 25
  },
  trading: {
    amount: 10, // USDT
    intervals: {
      analysis: 5000,
      trailing: 1000
    }
  },
  indicators: {
    ema: {
      short: 20,
      long: 50
    }
  },
  riskManagement: {
    tp: {
      long: 0.002,  // 0.2%
      short: -0.002
    },
    sl: {
      long: -0.001, // 0.1%
      short: 0.001
    }
  }
}; 