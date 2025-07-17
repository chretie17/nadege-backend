const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/DashboardController');

// Get dashboard data (main dashboard endpoint)
router.get('/', dashboardController.getDashboardData);

// Get user profile summary
router.get('/profile/:userId', dashboardController.getUserProfile);

// Get quick stats for role-specific dashboard
router.get('/stats', dashboardController.getQuickStats);

module.exports = router;