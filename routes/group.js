const express = require('express');
const router = express.Router();
const groupController = require('../controllers/GroupController');

// Get all public groups
router.get('/', groupController.getGroups);

// Get user's groups
router.get('/user/:userId', groupController.getUserGroups);

// Get group details with posts
router.get('/:id', groupController.getGroup);

// Get group members
router.get('/:groupId/members', groupController.getGroupMembers);

// Create a new group
router.post('/', groupController.createGroup);

// Join a group
router.post('/join', groupController.joinGroup);

// Leave a group
router.post('/leave', groupController.leaveGroup);

// Create a new post in a group
router.post('/posts', groupController.createGroupPost);

// Like/dislike a post
router.post('/posts/like', groupController.likeGroupPost);

module.exports = router;