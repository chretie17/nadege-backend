const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/AppointmentController');

router.get('/doctor/:doctor_id/availability', appointmentController.getDoctorAvailability);
router.post('/doctor/:doctor_id/availability', appointmentController.setDoctorAvailability);
router.put('/doctor/:doctor_id/availability', appointmentController.updateDoctorAvailability);
router.delete('/doctor/:doctor_id/availability/:day_of_week', appointmentController.deleteDoctorAvailability);

// Get all doctors (for appointment booking form)
router.get('/doctors', appointmentController.getDoctors);
// Get available time slots for a doctor on a specific date
router.get('/available-slots/:doctor_id/:date', appointmentController.getAvailableSlots);

// Create a new appointment
router.post('/book', appointmentController.createAppointment);

// Get patient's appointments
router.get('/patient/:patient_id', appointmentController.getPatientAppointments);

// Get doctor's appointments
router.get('/doctor/:doctor_id', appointmentController.getDoctorAppointments);

// Get upcoming appointments for dashboard
router.get('/upcoming', appointmentController.getUpcomingAppointments);

// Update appointment status
router.put('/:id/status', appointmentController.updateAppointmentStatus);

// Admin routes
router.get('/all', appointmentController.getAllAppointments);
router.get('/stats', appointmentController.getAppointmentStats);

module.exports = router;