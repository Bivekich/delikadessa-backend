const fetch = require('node-fetch');

const sendToTelegramNotification = async (bookingData) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  console.log('=== Sending Telegram Notification ===');
  console.log('Bot token exists:', !!botToken);
  console.log('Chat ID:', chatId);

  if (!botToken || !chatId) {
    console.error('Missing Telegram credentials');
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

  console.log('Prepared message:', message);

  try {
    console.log('Sending request to Telegram API...');
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
        }),
      }
    );

    const responseData = await response.json();
    console.log('Telegram API response:', responseData);

    if (!response.ok) {
      console.error('Telegram API error:', responseData);
      throw new Error(
        `Failed to send Telegram notification: ${
          responseData.description || 'Unknown error'
        }`
      );
    }

    console.log('Successfully sent Telegram notification');
    return responseData;
  } catch (error) {
    console.error('Telegram notification error:', error);
    // Throw the error but don't let it crash the application
    throw error;
  }
};

module.exports = {
  sendToTelegramNotification,
};
