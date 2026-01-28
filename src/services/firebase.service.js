const admin = require('firebase-admin');
const { User } = require('../models');

// Initialize Firebase Admin SDK
let isInitialized = false;

const initializeFirebase = () => {
  if (isInitialized) return;
  
  try {
    // Check for service account in environment
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccount) {
      const serviceAccountJson = JSON.parse(serviceAccount);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountJson),
      });
      
      console.log('✅ Firebase Admin SDK initialized');
      isInitialized = true;
    } else {
      console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT environment variable not set. Firebase notifications disabled.');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
  }
};

// Initialize on require
initializeFirebase();

/**
 * Send notification to specific user by ID
 */
const sendNotificationToUser = async (userId, notification, data = {}) => {
  if (!isInitialized) {
    console.warn('⚠️ Firebase not initialized. Cannot send notification.');
    return false;
  }

  try {
    // Find user and get FCM token
    const user = await User.findByPk(userId);
    
    if (!user || !user.fcm_token) {
      console.warn(`⚠️ User ${userId} not found or has no FCM token`);
      return false;
    }

    const message = {
      token: user.fcm_token,
      notification: {
        title: notification.title || 'FOOTMAN',
        body: notification.body || 'You have a new notification',
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'footman_notifications',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Notification sent to user ${userId}: ${response}`);
    return true;
  } catch (error) {
    console.error(`❌ Error sending notification to user ${userId}:`, error.message);
    
    // If token is invalid, clear it from database
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      console.log(`🔄 Clearing invalid FCM token for user ${userId}`);
      const user = await User.findByPk(userId);
      if (user) {
        await user.update({ fcm_token: null, fcm_token_updated_at: null });
      }
    }
    
    return false;
  }
};

/**
 * Send notification to multiple users
 */
const sendNotificationToUsers = async (userIds, notification, data = {}) => {
  if (!isInitialized) {
    console.warn('⚠️ Firebase not initialized. Cannot send notifications.');
    return { success: 0, failure: userIds.length };
  }

  try {
    // Get users and their FCM tokens
    const users = await User.findAll({
      where: { id: userIds },
      attributes: ['id', 'fcm_token']
    });

    const validTokens = users
      .filter(user => user.fcm_token && user.fcm_token.trim().length > 0)
      .map(user => user.fcm_token);

    if (validTokens.length === 0) {
      console.warn('⚠️ No valid FCM tokens found for users:', userIds);
      return { success: 0, failure: 0 };
    }

    const message = {
      notification: {
        title: notification.title || 'FOOTMAN',
        body: notification.body || 'You have a new notification',
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'footman_notifications',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      tokens: validTokens,
    };

    const response = await admin.messaging().sendMulticast(message);
    
    console.log(`✅ Multicast notification: ${response.successCount} successful, ${response.failureCount} failed`);
    
    // Clear invalid tokens
    if (response.failureCount > 0) {
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const token = validTokens[idx];
          const user = users.find(u => u.fcm_token === token);
          if (user) {
            console.log(`🔄 Clearing invalid token for user ${user.id}`);
            User.update(
              { fcm_token: null, fcm_token_updated_at: null },
              { where: { id: user.id } }
            );
          }
        }
      });
    }
    
    return {
      success: response.successCount,
      failure: response.failureCount,
    };
  } catch (error) {
    console.error('❌ Error sending multicast notification:', error.message);
    return { success: 0, failure: userIds.length };
  }
};

/**
 * Send notification to all online partners within radius
 */
const sendNotificationToNearbyPartners = async (latitude, longitude, radiusKm, notification, data = {}) => {
  if (!isInitialized) {
    console.warn('⚠️ Firebase not initialized. Cannot send notifications.');
    return { success: 0, failure: 0 };
  }

  try {
    // Find nearby online partners
    const { sequelize } = require('../config/database');
    
    const query = `
      SELECT id, fcm_token,
      (6371 * acos(
        cos(radians(:latitude)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians(:longitude)) + 
        sin(radians(:latitude)) * sin(radians(latitude))
      )) AS distance
      FROM users
      WHERE user_type = 'delivery'
      AND is_online = true
      AND fcm_token IS NOT NULL
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      HAVING distance <= :radius
      ORDER BY distance
      LIMIT 20
    `;

    const nearbyPartners = await sequelize.query(query, {
      replacements: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius: parseFloat(radiusKm)
      },
      type: sequelize.QueryTypes.SELECT
    });

    if (nearbyPartners.length === 0) {
      console.log('ℹ️ No nearby online partners with FCM tokens');
      return { success: 0, failure: 0 };
    }

    const validTokens = nearbyPartners
      .map(partner => partner.fcm_token)
      .filter(token => token && token.trim().length > 0);

    if (validTokens.length === 0) {
      console.warn('⚠️ Nearby partners found but no valid FCM tokens');
      return { success: 0, failure: 0 };
    }

    const message = {
      notification: {
        title: notification.title || 'FOOTMAN',
        body: notification.body || 'New request nearby',
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'footman_notifications',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      tokens: validTokens,
    };

    const response = await admin.messaging().sendMulticast(message);
    
    console.log(`✅ Notification sent to ${response.successCount} nearby partners`);
    
    return {
      success: response.successCount,
      failure: response.failureCount,
      totalPartners: nearbyPartners.length
    };
  } catch (error) {
    console.error('❌ Error sending notification to nearby partners:', error.message);
    return { success: 0, failure: 0 };
  }
};

/**
 * Common notification templates
 */
const NotificationTemplates = {
  // Customer notifications
  requestAccepted: (footmanName) => ({
    title: '✅ Request Accepted!',
    body: `${footmanName} accepted your request`
  }),
  
  jobStarted: (footmanName) => ({
    title: '🚀 Job Started',
    body: `${footmanName} started your job`
  }),
  
  jobCompleted: () => ({
    title: '🎉 Job Completed!',
    body: 'Your job has been completed. Please make payment.'
  }),
  
  paymentConfirmed: () => ({
    title: '💰 Payment Confirmed',
    body: 'Payment received successfully. Thank you!'
  }),
  
  // Partner notifications
  newRequest: (distance, price) => ({
    title: '🆕 New Request!',
    body: `${distance}KM away • Earn ৳${price}`
  }),
  
  requestCancelled: () => ({
    title: '❌ Request Cancelled',
    body: 'Customer cancelled the request'
  }),
  
  paymentSelected: (method) => ({
    title: '💳 Payment Selected',
    body: `Customer selected ${method.toUpperCase()} payment`
  }),
  
  paymentWaiting: () => ({
    title: '⏳ Payment Waiting',
    body: 'Customer completed job. Waiting for payment selection.'
  }),
};

module.exports = {
  initializeFirebase,
  sendNotificationToUser,
  sendNotificationToUsers,
  sendNotificationToNearbyPartners,
  NotificationTemplates,
};
