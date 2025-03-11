const axios = require('axios');

class NotificationService {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }

  async sendMessage(message) {
    try {
      await axios.post(this.webhookUrl, { text: message });
    } catch (error) {
      console.error(`Notification failed: ${error.message}`);
    }
  }
}

module.exports = NotificationService; 