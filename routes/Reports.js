const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/ReportsController');

// Healthcare system report routes with no authentication requirements
router.get('/user-overview', reportsController.getUserOverviewReport);
router.get('/appointments-analytics', reportsController.getAppointmentsAnalytics);
router.get('/doctor-availability', reportsController.getDoctorAvailabilityReport);
router.get('/community-engagement', reportsController.getCommunityEngagementMetrics);

// Export the router
module.exports = router;