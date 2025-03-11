const axios = require('axios');
const Logger = require('../utils/logger');

class NotificationService {
  constructor(webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL) {
    this.webhookUrl = webhookUrl;
  }

  async send(message) {
    try {
      await axios.post(this.webhookUrl, { text: message });
      Logger.notification(`Sent: ${message}`);
    } catch (error) {
      Logger.error(`Notification failed: ${error.message}`);
    }
  }

  async sendError(error) {
    const message = `❌ Error: ${error.message}`;
    await this.send(message);
  }

  async sendTrade(type, details) {
    const emoji = type === 'entry' ? '📈' : '📉';
    const message = `${emoji} ${type.toUpperCase()}: ${details}`;
    await this.send(message);
  }
}

module.exports = NotificationService; 