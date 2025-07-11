const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/ReportsController');

// Report routes with no authentication requirements
router.get('/user-overview', reportsController.getUserOverviewReport);
router.get('/job-market', reportsController.getJobMarketSnapshot);
router.get('/skills-assessment', reportsController.getSkillsAssessmentSummary);
router.get('/community-engagement', reportsController.getCommunityEngagementMetrics);

// Export the router
module.exports = router;