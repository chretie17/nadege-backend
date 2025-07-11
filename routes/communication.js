const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/CommunicationController');

// Message routes
router.post('/send-message', communicationController.sendMessage);
router.get('/messages/:userId', communicationController.getMessages);
router.get('/conversation/:user1/:user2', communicationController.getConversation);

// Message read status routes
router.put('/mark-read/:messageId', communicationController.markAsRead); // Legacy route
router.put('/mark-message-read/:messageId', communicationController.markMessageAsRead); // New route with user validation
router.put('/mark-conversation-read/:userId/:otherUserId', communicationController.markConversationAsRead);

// Notification routes
router.post('/create-notification', communicationController.createNotification);
router.post('/send-notification', communicationController.sendNotificationToUser);
router.get('/notifications/:userId', communicationController.getNotifications);
router.put('/mark-notification-read/:notificationId', communicationController.markNotificationAsRead);

// Utility routes
router.get('/unread-count/:userId', communicationController.getUnreadCount);
router.get('/chat-users', communicationController.getChatUsers);

module.exports = router;