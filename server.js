const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const { createPayment, checkPaymentStatus } = require('./utils/payment');
const { sendToTelegramNotification } = require('./utils/telegram');

// Load environment variables from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

// Middleware
app.use(cors());
// Use raw body for webhook to properly verify signature
app.use('/api/webhook/payment', express.raw({ type: 'application/json' }));
app.use(express.json()); // For all other routes

// Store pending bookings and active polls in memory
const pendingBookings = new Map();
const activePolls = new Map();

// Function to poll payment status
const pollPaymentStatus = async (paymentId, bookingData, maxAttempts = 1440) => { // 1440 attempts * 60 seconds = 24 hours
  let attempts = 0;
  
  // Check if we're already polling this payment
  if (activePolls.has(paymentId)) {
    console.log(`Already polling payment ${paymentId}`);
    return;
  }

  const poll = async () => {
    try {
      // Calculate hours and minutes elapsed
      const minutesElapsed = attempts;
      const hoursElapsed = Math.floor(minutesElapsed / 60);
      const remainingMinutes = minutesElapsed % 60;
      const timeElapsed = hoursElapsed > 0 
        ? `${hoursElapsed}h ${remainingMinutes}m`
        : `${remainingMinutes}m`;

      console.log(`Polling payment status for ${paymentId}, attempt ${attempts + 1} (${timeElapsed} elapsed)`);
      const status = await checkPaymentStatus(paymentId);
      
      switch (status.status) {
        case 'succeeded':
          console.log(`Payment ${paymentId} succeeded after ${timeElapsed}, sending notification`);
          await sendToTelegramNotification({
            ...bookingData,
            paymentId,
            paymentStatus: 'Оплачено'
          });
          pendingBookings.delete(paymentId);
          activePolls.delete(paymentId);
          return;
          
        case 'canceled':
          console.log(`Payment ${paymentId} canceled after ${timeElapsed}, sending notification`);
          await sendToTelegramNotification({
            ...bookingData,
            paymentId,
            paymentStatus: 'Отменено'
          });
          pendingBookings.delete(paymentId);
          activePolls.delete(paymentId);
          return;
          
        case 'pending':
          attempts++;
          if (attempts < maxAttempts) {
            // Continue polling after 1 minute
            setTimeout(poll, 60000);
          } else {
            console.log(`Max polling attempts reached for payment ${paymentId} after 24 hours`);
            // Send notification about payment still pending after 24 hours
            try {
              await sendToTelegramNotification({
                ...bookingData,
                paymentId,
                paymentStatus: 'Ожидает оплаты более 24 часов'
              });
            } catch (error) {
              console.error('Failed to send timeout notification:', error);
            }
            activePolls.delete(paymentId);
          }
          break;
          
        default:
          console.log(`Unhandled payment status: ${status.status}`);
          activePolls.delete(paymentId);
      }
    } catch (error) {
      console.error('Error polling payment status:', error);
      attempts++;
      if (attempts < maxAttempts) {
        // Retry after 1 minute on error
        setTimeout(poll, 60000);
      } else {
        console.log(`Stopped polling for payment ${paymentId} after 24 hours due to errors`);
        try {
          await sendToTelegramNotification({
            ...bookingData,
            paymentId,
            paymentStatus: 'Ошибка проверки статуса после 24 часов'
          });
        } catch (notifyError) {
          console.error('Failed to send error notification:', notifyError);
        }
        activePolls.delete(paymentId);
      }
    }
  };

  // Start polling
  activePolls.set(paymentId, true);
  await poll();
};

// YooKassa webhook endpoint
app.post('/api/webhook/payment', async (req, res) => {
  console.log('=== Webhook Request ===');
  console.log('Headers:', req.headers);
  console.log('Raw Body:', req.body.toString());
  
  try {
    // Parse the raw body
    const notification = JSON.parse(req.body.toString());
    console.log('Parsed notification:', notification);

    const { event, object } = notification;
    console.log('Event type:', event);
    console.log('Payment object:', object);

    // Get payment data
    const paymentId = object.id;
    console.log('Payment ID:', paymentId);

    // Try to get booking data from both sources
    const storedBookingData = pendingBookings.get(paymentId);
    const metadataBookingData = object.metadata;
    
    console.log('Stored booking data:', storedBookingData);
    console.log('Metadata booking data:', metadataBookingData);

    // Use stored data if available, otherwise use metadata
    const bookingData = storedBookingData || metadataBookingData;

    if (!bookingData) {
      console.error('No booking data found for payment:', paymentId);
      return res.status(200).end();
    }

    console.log('Final booking data to use:', bookingData);

    // Stop polling for this payment if it's active
    activePolls.delete(paymentId);

    // Process payment events
    switch (event) {
      case 'payment.succeeded':
        console.log('Processing successful payment notification');
        try {
          await sendToTelegramNotification({
            ...bookingData,
            paymentId,
            paymentStatus: 'Оплачено'
          });
          console.log('Successfully sent Telegram notification');
          pendingBookings.delete(paymentId);
        } catch (error) {
          console.error('Failed to send Telegram notification:', error);
        }
        break;

      case 'payment.waiting_for_capture':
        console.log('Processing waiting for capture notification');
        try {
          await sendToTelegramNotification({
            ...bookingData,
            paymentId,
            paymentStatus: 'Ожидает подтверждения'
          });
          console.log('Successfully sent waiting for capture notification');
        } catch (error) {
          console.error('Failed to send waiting notification:', error);
        }
        break;

      case 'payment.canceled':
        console.log('Processing cancellation notification');
        try {
          await sendToTelegramNotification({
            ...bookingData,
            paymentId,
            paymentStatus: 'Отменено'
          });
          console.log('Successfully sent cancellation notification');
          pendingBookings.delete(paymentId);
        } catch (error) {
          console.error('Failed to send cancellation notification:', error);
        }
        break;

      default:
        console.log('Unhandled event type:', event);
    }

    // Always return 200 OK to acknowledge receipt
    res.status(200).end();
  } catch (error) {
    console.error('Error processing webhook:', error);
    // Still return 200 to acknowledge receipt
    res.status(200).end();
  }
});

// Also add logging to payment creation
app.post('/api/create-payment', async (req, res) => {
  try {
    const { bookingData } = req.body;
    console.log('=== Creating Payment ===');
    console.log('Booking data:', bookingData);
    
    const payment = await createPayment(bookingData);
    console.log('Payment created:', payment);
    
    // Store booking data
    pendingBookings.set(payment.id, bookingData);
    
    // Start polling payment status
    pollPaymentStatus(payment.id, bookingData);
    
    res.json(payment);
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ error: error.message || 'Не удалось создать платеж' });
  }
});

// Add logging to status check endpoint
app.get('/api/check-payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    console.log('=== Checking Payment Status ===');
    console.log('Payment ID:', paymentId);
    console.log('Current pendingBookings:', [...pendingBookings.entries()]);
    
    const status = await checkPaymentStatus(paymentId);
    console.log('Payment status:', status);

    // If payment is successful, try to send notification as backup
    if (status.status === 'succeeded') {
      const bookingData = pendingBookings.get(paymentId);
      if (bookingData) {
        console.log('Sending backup notification for successful payment');
        try {
          await sendToTelegramNotification({
            ...bookingData,
            paymentId,
            paymentStatus: 'Оплачено'
          });
          console.log('Successfully sent backup notification');
          pendingBookings.delete(paymentId);
        } catch (error) {
          console.error('Failed to send backup notification:', error);
        }
      }
    }

    res.json(status);
  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({ error: error.message || 'Не удалось проверить статус платежа' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Environment variables:');
  console.log('BACKEND_URL:', process.env.BACKEND_URL);
  console.log('SHOP_ID:', process.env.SHOP_ID);
  console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'Set' : 'Not set');
  console.log('TELEGRAM_CHAT_ID:', process.env.TELEGRAM_CHAT_ID);
}); 