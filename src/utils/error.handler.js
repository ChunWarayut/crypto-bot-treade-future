const Logger = require('./logger');

const withErrorHandling = (fn, notification) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    Logger.error(error);
    if (notification) {
      await notification.sendError(error);
    }
    throw error;
  }
};

module.exports = { withErrorHandling }; 