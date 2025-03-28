const fetch = require('node-fetch');

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3';

// Функция для расчета стоимости в зависимости от количества гостей
const calculatePrice = (guests) => {
  // Извлекаем только число из строки (например, "5 человек" -> 5)
  const guestCount = parseInt(guests);

  if (guestCount <= 2) return 3000;
  if (guestCount <= 4) return 6000;
  if (guestCount <= 8) return 9000;
  if (guestCount <= 12) return 12000;

  // Если что-то пошло не так, возвращаем базовую цену
  return 3000;
};

const createPayment = async (bookingData) => {
  const shopId = process.env.SHOP_ID;
  const secretKey = process.env.KASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    throw new Error('Missing YooKassa credentials');
  }

  // Create a unique idempotency key
  const idempotenceKey = `booking_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;

  // Рассчитываем стоимость в зависимости от количества гостей
  const price = calculatePrice(bookingData.guests).toFixed(2);

  const paymentData = {
    amount: {
      value: price,
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: `${
        process.env.FRONTEND_URL || 'http://localhost:5173'
      }/success`,
      locale: 'ru_RU',
    },
    description: `Бронирование столика на ${bookingData.date} ${bookingData.time}`,
    receipt: {
      customer: {
        email: bookingData.email,
        phone: bookingData.phone,
      },
      items: [
        {
          description: 'Депозит за бронирование столика',
          quantity: '1',
          amount: {
            value: price,
            currency: 'RUB',
          },
          vat_code: 1,
          payment_mode: 'full_prepayment',
          payment_subject: 'service',
        },
      ],
    },
    metadata: {
      booking_id: idempotenceKey,
      customer_email: bookingData.email,
      customer_phone: bookingData.phone,
      booking_date: bookingData.date,
      booking_time: bookingData.time,
      customer_name: `${bookingData.firstName} ${bookingData.lastName}`,
      guests: bookingData.guests,
      firstName: bookingData.firstName,
      lastName: bookingData.lastName,
    },
  };

  try {
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    const response = await fetch(`${YOOKASSA_API_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(paymentData),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('YooKassa error response:', responseData);
      throw new Error(responseData.description || 'Payment creation failed');
    }

    return responseData;
  } catch (error) {
    console.error('Payment creation error:', error);
    throw error;
  }
};

const checkPaymentStatus = async (paymentId) => {
  const shopId = process.env.SHOP_ID;
  const secretKey = process.env.KASSA_SECRET_KEY;

  if (!shopId || !secretKey || !paymentId) {
    throw new Error('Missing required payment check data');
  }

  try {
    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');

    const response = await fetch(`${YOOKASSA_API_URL}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Payment status check error response:', responseData);
      throw new Error(
        responseData.description || 'Payment status check failed'
      );
    }

    return responseData;
  } catch (error) {
    console.error('Payment status check error:', error);
    throw error;
  }
};

module.exports = {
  createPayment,
  checkPaymentStatus,
};
