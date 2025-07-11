const express = require('express');
const router = express.Router();

// Import controllers
const adminController = require('../controllers/AdminController');

// Success Stories Management
router.get('/success-stories', adminController.getAllSuccessStories);
router.put('/success-stories/:id', adminController.updateSuccessStory);
router.delete('/success-stories/:id', adminController.deleteSuccessStory);

// Forum Management
router.get('/forum/topics', adminController.getAllForumTopics);
router.get('/forum/topics/:id/posts', adminController.getTopicPosts);
router.put('/forum/topics/:id', adminController.updateForumTopic);
router.delete('/forum/topics/:id', adminController.deleteForumTopic);
router.put('/forum/posts/:id', adminController.updateForumPost);
router.delete('/forum/posts/:id', adminController.deleteForumPost);

// Flagged Content
router.get('/flagged-content', adminController.getFlaggedContent);
router.put('/flagged-content/:type/:id/approve', adminController.approveFlaggedContent);
router.delete('/flagged-content/:type/:id', adminController.deleteFlaggedContent);

// Admin Dashboard Stats
router.get('/stats', adminController.getAdminStats);

module.exports = router;