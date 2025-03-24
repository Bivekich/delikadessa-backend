const fetch = require('node-fetch');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from parent directory or directly from delikadessa directory
dotenv.config({ path: path.join(__dirname, '../.env') });
// Try alternative path if first one failed
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.log('Trying alternative env file path...');
  dotenv.config({ path: path.join(__dirname, '../delikadessa/.env') });
}

// Print environment variables for debugging
console.log('Environment variables:');
console.log('TELEGRAM_BOT_TOKEN exists:', !!process.env.TELEGRAM_BOT_TOKEN);
console.log('TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID);
console.log(
  'Bot token first 5 chars:',
  process.env.TELEGRAM_BOT_TOKEN
    ? process.env.TELEGRAM_BOT_TOKEN.substring(0, 5) + '...'
    : 'N/A'
);

const sendTestMessage = async () => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  // Используем новый ID супергруппы из ошибки
  const chatId = '-1002653095641'; // Исправленный ID супергруппы
  const oldChatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('Missing Telegram credentials');
    return;
  }

  const message = `
🧪 Тестовое сообщение!
⏰ Время отправки: ${new Date().toLocaleString()}
🔄 Обнаружена миграция из группы ${oldChatId} в супергруппу ${chatId}
`;

  console.log('Sending test message to Telegram...');
  console.log('Using new supergroup Chat ID:', chatId);

  try {
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    console.log(
      'Using Telegram URL:',
      'https://api.telegram.org/bot***' +
        botToken.substring(botToken.length - 5) +
        '/sendMessage'
    );

    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    });

    const responseData = await response.json();
    console.log('Telegram API response:', responseData);

    if (response.ok) {
      console.log('✅ Test message sent successfully!');
      console.log(
        '⚠️ IMPORTANT: Update your .env file with the new TELEGRAM_CHAT_ID: ' +
          chatId
      );
    } else {
      console.error(
        '❌ Failed to send test message:',
        responseData.description
      );
    }
  } catch (error) {
    console.error('❌ Error sending test message:', error);
  }
};

// Запуск теста
sendTestMessage();
