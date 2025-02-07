const fetch = require('node-fetch');

const sendToTelegramNotification = async (bookingData) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error('Missing Telegram credentials');
  }

  const message = `
🎉 Новое бронирование!

👤 Клиент: ${bookingData.firstName} ${bookingData.lastName}
📧 Email: ${bookingData.email}
📱 Телефон: ${bookingData.phone}
📅 Дата: ${bookingData.date}
⏰ Время: ${bookingData.time}
👥 Гости: ${bookingData.guests}
💳 Статус оплаты: ${bookingData.paymentStatus}
🆔 ID платежа: ${bookingData.paymentId}
`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send Telegram notification');
    }

    return await response.json();
  } catch (error) {
    console.error('Telegram notification error:', error);
    throw error;
  }
};

module.exports = {
  sendToTelegramNotification,
}; 
