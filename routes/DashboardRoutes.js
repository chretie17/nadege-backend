const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/DashboardController');

// Routes for the dashboard data
// All routes are protected with authentication middleware

// Main dashboard stats (for the 4 cards)
router.get('/stats',  dashboardController.getDashboardStats);

// Skills distribution chart data
router.get('/skills-distribution',  dashboardController.getSkillsDistribution);

// Job market trends data
router.get('/job-market-trends', dashboardController.getJobMarketTrends);

// Application funnel data
router.get('/application-funnel', dashboardController.getApplicationFunnel);

module.exports = router;