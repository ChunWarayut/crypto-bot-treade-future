class Logger {
  static trade(message, data = {}) {
    console.log(`[TRADE] ${message}`, Object.keys(data).length ? data : '');
  }

  static strategy(name, message) {
    console.log(`[STRATEGY:${name}] ${message}`);
  }

  static error(message) {
    console.error(`[ERROR] ${message}`);
  }

  static notification(message) {
    console.log(`[NOTIFICATION] ${message}`);
  }

  static position(message) {
    console.log(`[POSITION] ${message}`);
  }

  static debug(context, message, data = {}) {
    if (process.env.DEBUG) {
      console.log(`[DEBUG:${context}] ${message}`, Object.keys(data).length ? data : '');
    }
  }
}

module.exports = Logger; 