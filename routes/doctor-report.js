const express = require('express');
const router = express.Router();
const doctorReportController = require('../controllers/DoctorReport');

/// Get doctor's appointment statistics
// GET /api/doctor-reports/:doctor_id/stats?period=month
router.get('/:doctor_id/stats', doctorReportController.getDoctorStats);

// Get doctor's appointment trends (for charts)
// GET /api/doctor-reports/:doctor_id/trends?months=12
router.get('/:doctor_id/trends',  doctorReportController.getDoctorTrends);

// Get doctor's daily schedule report
// GET /api/doctor-reports/:doctor_id/daily-schedule?date=2024-01-15
router.get('/:doctor_id/daily-schedule',  doctorReportController.getDailyScheduleReport);

// Get doctor's patient demographics
// GET /api/doctor-reports/:doctor_id/demographics
router.get('/:doctor_id/demographics',  doctorReportController.getPatientDemographics);

// Get doctor's most common appointment reasons
// GET /api/doctor-reports/:doctor_id/common-reasons?limit=10
router.get('/:doctor_id/common-reasons',  doctorReportController.getCommonReasons);

// Get doctor's appointment patterns by day of week
// GET /api/doctor-reports/:doctor_id/patterns
router.get('/:doctor_id/patterns',  doctorReportController.getAppointmentPatterns);

// Get doctor's peak hours analysis
// GET /api/doctor-reports/:doctor_id/peak-hours
router.get('/:doctor_id/peak-hours',  doctorReportController.getPeakHours);

// Get doctor's recent patients
// GET /api/doctor-reports/:doctor_id/recent-patients?limit=20
router.get('/:doctor_id/recent-patients', doctorReportController.getRecentPatients);

// Get comprehensive doctor performance report
// GET /api/doctor-reports/:doctor_id/performance?start_date=2024-01-01&end_date=2024-01-31
router.get('/:doctor_id/performance',  doctorReportController.getPerformanceReport);

module.exports = router;