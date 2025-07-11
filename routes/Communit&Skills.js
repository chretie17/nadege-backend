const express = require('express');
const router = express.Router();

// Import controllers
const communityController = require('../controllers/CommunityController');
const postLikesController = require('../controllers/PostLikesController');

// Community routes
router.get('/forum/topics', communityController.getForumTopics);
router.get('/forum/topics/:id', communityController.getForumTopic);
router.post('/forum/topics', communityController.createForumTopic);
router.post('/forum/posts', communityController.createForumPost);
router.get('/success-stories', communityController.getSuccessStories);
router.post('/success-stories', communityController.submitSuccessStory);
router.put('/success-stories/:id/approve', communityController.approveSuccessStory);

// Post likes routes
router.get('/post-likes/:post_id', postLikesController.getPostLikes);
router.get('/post-likes/user/:user_id', postLikesController.getUserLikes);
router.post('/post-likes', postLikesController.addPostLike);
router.delete('/post-likes', postLikesController.removePostLike);




module.exports = router;