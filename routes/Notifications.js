const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/NotificationsController');

// Get notifications for a specific user
router.get('/user/:user_id', notificationController.getUserNotifications);

// Get unread notification count for a user
router.get('/user/:user_id/unread-count', notificationController.getUnreadCount);

// Get recent notifications for dashboard
router.get('/user/:user_id/recent', notificationController.getRecentNotifications);

// Mark a notification as read
router.put('/:notification_id/read', notificationController.markAsRead);

// Mark all notifications as read for a user
router.put('/user/:user_id/read-all', notificationController.markAllAsRead);

// Delete a notification
router.delete('/:notification_id', notificationController.deleteNotification);

// Create a custom notification (admin only)
router.post('/create', notificationController.createNotification);

module.exports = router;