const db = require('../config/db');


// Get all doctors with their specializations (for booking form)
exports.getDoctors = (req, res) => {
    const query = `
        SELECT 
            id,
            name,
            email,
            phone,
            specialization,
            experience,
            education
        FROM 
            users
        WHERE 
            role = 'doctor'
        ORDER BY 
            name ASC
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get all appointments (admin view)
exports.getAllAppointments = (req, res) => {
    const query = `
        SELECT 
            a.*,
            p.name as patient_name,
            p.email as patient_email,
            p.phone as patient_phone,
            d.name as doctor_name,
            d.email as doctor_email,
            d.specialization as doctor_specialization,
            cb.name as confirmed_by_name,
            canb.name as cancelled_by_name
        FROM 
            appointments a
        JOIN 
            users p ON a.patient_id = p.id
        JOIN 
            users d ON a.doctor_id = d.id
        LEFT JOIN 
            users cb ON a.confirmed_by = cb.id
        LEFT JOIN 
            users canb ON a.cancelled_by = canb.id
        ORDER BY 
            a.appointment_date DESC, a.appointment_time DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get appointments for a specific patient
exports.getPatientAppointments = (req, res) => {
    const { patient_id } = req.params;
    
    const query = `
        SELECT 
            a.*,
            d.name as doctor_name,
            d.email as doctor_email,
            d.specialization as doctor_specialization,
            d.phone as doctor_phone
        FROM 
            appointments a
        JOIN 
            users d ON a.doctor_id = d.id
        WHERE 
            a.patient_id = ?
        ORDER BY 
            a.appointment_date DESC, a.appointment_time DESC
    `;
    
    db.query(query, [patient_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get appointments for a specific doctor
exports.getDoctorAppointments = (req, res) => {
    const { doctor_id } = req.params;
    const { date, status } = req.query;
    
    let query = `
        SELECT 
            a.*,
            p.name as patient_name,
            p.email as patient_email,
            p.phone as patient_phone,
            p.date_of_birth as patient_dob
        FROM 
            appointments a
        JOIN 
            users p ON a.patient_id = p.id
        WHERE 
            a.doctor_id = ?
    `;
    
    const params = [doctor_id];
    
    if (date) {
        query += ' AND a.appointment_date = ?';
        params.push(date);
    }
    
    if (status) {
        query += ' AND a.status = ?';
        params.push(status);
    }
    
    query += ' ORDER BY a.appointment_date ASC, a.appointment_time ASC';
    
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get available time slots for a doctor on a specific date
exports.getAvailableSlots = (req, res) => {
    const { doctor_id, date } = req.params;
    
    // Check if the date is in the past
    if (isPastDate(date)) {
        return res.status(400).json({ error: 'Cannot book appointments for past dates' });
    }
    
    // Get day of week for the requested date
    const dayOfWeekQuery = `SELECT LOWER(DAYNAME(?)) as day_of_week`;
    
    db.query(dayOfWeekQuery, [date], (err, dayResult) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const dayOfWeek = dayResult[0].day_of_week;
        
        // Get doctor's availability for this day
        const availabilityQuery = `
            SELECT start_time, end_time
            FROM doctor_availability
            WHERE doctor_id = ? AND day_of_week = ? AND is_available = true
        `;
        
        db.query(availabilityQuery, [doctor_id, dayOfWeek], (err, availability) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (availability.length === 0) {
                return res.json({ available_slots: [], message: 'Doctor not available on this day' });
            }
            
            // Get already booked appointments for this date
            const bookedQuery = `
                SELECT appointment_time
                FROM appointments
                WHERE doctor_id = ? AND appointment_date = ? AND status IN ('pending', 'confirmed')
            `;
            
            db.query(bookedQuery, [doctor_id, date], (err, booked) => {
                if (err) return res.status(500).json({ error: err.message });
                
                const bookedTimes = booked.map(b => formatTime(b.appointment_time));
                const availableSlots = [];
                
                // Generate 30-minute slots
                availability.forEach(slot => {
                    const startTime = new Date(`2000-01-01 ${slot.start_time}`);
                    const endTime = new Date(`2000-01-01 ${slot.end_time}`);
                    
                    while (startTime < endTime) {
                        const timeString = formatTime(startTime.toTimeString());
                        const fullTimeString = startTime.toTimeString().substring(0, 8);
                        
                        if (!bookedTimes.includes(timeString)) {
                            availableSlots.push({
                                time: fullTimeString,
                                display_time: timeString
                            });
                        }
                        
                        startTime.setMinutes(startTime.getMinutes() + 30);
                    }
                });
                
                res.json({ available_slots: availableSlots });
            });
        });
    });
};
// Add these functions to your AppointmentController.js

// Get doctor's availability schedule
exports.getDoctorAvailability = (req, res) => {
    const { doctor_id } = req.params;
    
    const query = `
        SELECT 
            id,
            day_of_week,
            start_time,
            end_time,
            is_available
        FROM 
            doctor_availability
        WHERE 
            doctor_id = ?
        ORDER BY 
            FIELD(day_of_week, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    `;
    
    db.query(query, [doctor_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Create or update doctor's availability for a specific day
exports.setDoctorAvailability = (req, res) => {
    const { doctor_id } = req.params;
    const { day_of_week, start_time, end_time, is_available } = req.body;
    
    if (!day_of_week) {
        return res.status(400).json({ error: 'Day of week is required' });
    }
    
    const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (!validDays.includes(day_of_week.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid day of week' });
    }
    
    // Check if availability already exists for this doctor and day
    const checkQuery = `
        SELECT id FROM doctor_availability 
        WHERE doctor_id = ? AND day_of_week = ?
    `;
    
    db.query(checkQuery, [doctor_id, day_of_week.toLowerCase()], (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (existing.length > 0) {
            // Update existing availability
            const updateQuery = `
                UPDATE doctor_availability 
                SET start_time = ?, end_time = ?, is_available = ?, updated_at = CURRENT_TIMESTAMP
                WHERE doctor_id = ? AND day_of_week = ?
            `;
            
            db.query(updateQuery, [start_time, end_time, is_available, doctor_id, day_of_week.toLowerCase()], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Availability updated successfully' });
            });
        } else {
            // Create new availability
            const insertQuery = `
                INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, is_available)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            db.query(insertQuery, [doctor_id, day_of_week.toLowerCase(), start_time, end_time, is_available], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ 
                    message: 'Availability created successfully',
                    availability_id: result.insertId
                });
            });
        }
    });
};

// Update multiple availability slots at once
exports.updateDoctorAvailability = (req, res) => {
    const { doctor_id } = req.params;
    const { availability_schedule } = req.body; // Array of availability objects
    
    if (!Array.isArray(availability_schedule)) {
        return res.status(400).json({ error: 'Availability schedule must be an array' });
    }
    
    // Start transaction
    db.beginTransaction((err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Delete existing availability for this doctor
        const deleteQuery = 'DELETE FROM doctor_availability WHERE doctor_id = ?';
        
        db.query(deleteQuery, [doctor_id], (err) => {
            if (err) {
                return db.rollback(() => {
                    res.status(500).json({ error: err.message });
                });
            }
            
            // Insert new availability schedule
            const insertQuery = `
                INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, is_available)
                VALUES ?
            `;
            
            const values = availability_schedule.map(slot => [
                doctor_id,
                slot.day_of_week.toLowerCase(),
                slot.start_time,
                slot.end_time,
                slot.is_available
            ]);
            
            db.query(insertQuery, [values], (err) => {
                if (err) {
                    return db.rollback(() => {
                        res.status(500).json({ error: err.message });
                    });
                }
                
                db.commit((err) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ error: err.message });
                        });
                    }
                    
                    res.json({ message: 'Availability schedule updated successfully' });
                });
            });
        });
    });
};

// Delete doctor's availability for a specific day
exports.deleteDoctorAvailability = (req, res) => {
    const { doctor_id, day_of_week } = req.params;
    
    const query = `
        DELETE FROM doctor_availability 
        WHERE doctor_id = ? AND day_of_week = ?
    `;
    
    db.query(query, [doctor_id, day_of_week.toLowerCase()], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Availability not found' });
        }
        
        res.json({ message: 'Availability deleted successfully' });
    });
};

// Add helper function for time formatting (if not already present)
function formatTime(timeString) {
    if (!timeString) return '';
    
    // Handle different time formats
    const time = new Date(`2000-01-01 ${timeString}`);
    return time.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// Helper function to check if date is in the past (if not already present)
function isPastDate(dateString) {
    const inputDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return inputDate < today;
}
// Create a new appointment booking
exports.createAppointment = (req, res) => {
    const { patient_id, doctor_id, appointment_date, appointment_time, reason } = req.body;
    
    if (!patient_id || !doctor_id || !appointment_date || !appointment_time) {
        return res.status(400).json({ 
            error: 'Patient ID, Doctor ID, appointment date, and time are required' 
        });
    }
    
    // Check if the date is in the past
    if (isPastDate(appointment_date)) {
        return res.status(400).json({ error: 'Cannot book appointments for past dates' });
    }
    
    // Check if the slot is still available
    const checkQuery = `
        SELECT COUNT(*) as count
        FROM appointments
        WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ?
        AND status IN ('pending', 'confirmed')
    `;
    
    db.query(checkQuery, [doctor_id, appointment_date, appointment_time], (err, checkResult) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (checkResult[0].count > 0) {
            return res.status(400).json({ error: 'This time slot is no longer available' });
        }
        
        // Verify that both patient and doctor exist
        const verifyUsersQuery = `
            SELECT 
                (SELECT COUNT(*) FROM users WHERE id = ? AND role = 'patient') as patient_exists,
                (SELECT COUNT(*) FROM users WHERE id = ? AND role = 'doctor') as doctor_exists
        `;
        
        db.query(verifyUsersQuery, [patient_id, doctor_id], (err, verifyResult) => {
            if (err) return res.status(500).json({ error: err.message });
            
            const { patient_exists, doctor_exists } = verifyResult[0];
            
            if (!patient_exists) {
                return res.status(400).json({ error: 'Patient not found' });
            }
            
            if (!doctor_exists) {
                return res.status(400).json({ error: 'Doctor not found' });
            }
            
            // Create the appointment
            const insertQuery = `
                INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, reason)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            db.query(insertQuery, [patient_id, doctor_id, appointment_date, appointment_time, reason || null], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                
                // Create notification for both patient and doctor
                const notificationQuery = `
                    INSERT INTO appointment_notifications (appointment_id, user_id, notification_type, message)
                    VALUES 
                    (?, ?, 'booking_confirmation', 'Your appointment has been booked successfully'),
                    (?, ?, 'booking_confirmation', 'New appointment booking received')
                `;
                
                db.query(notificationQuery, [result.insertId, patient_id, result.insertId, doctor_id], (err) => {
                    if (err) console.error('Notification creation failed:', err);
                });
                
                res.status(201).json({
                    message: 'Appointment booked successfully',
                    appointment_id: result.insertId,
                    appointment_date,
                    appointment_time: formatTime(appointment_time)
                });
            });
        });
    });
};

// Update appointment status (confirm, cancel, complete)
exports.updateAppointmentStatus = (req, res) => {
    const { id } = req.params;
    const { status, updated_by, notes, cancellation_reason } = req.body;
    
    if (!status || !updated_by) {
        return res.status(400).json({ error: 'Status and updated_by are required' });
    }
    
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    
    let query = 'UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP';
    const params = [status];
    
    if (status === 'confirmed') {
        query += ', confirmed_by = ?, confirmed_at = CURRENT_TIMESTAMP';
        params.push(updated_by);
    } else if (status === 'cancelled') {
        query += ', cancelled_by = ?, cancelled_at = CURRENT_TIMESTAMP';
        params.push(updated_by);
        if (cancellation_reason) {
            query += ', cancellation_reason = ?';
            params.push(cancellation_reason);
        }
    }
    
    if (notes) {
        query += ', notes = ?';
        params.push(notes);
    }
    
    query += ' WHERE id = ?';
    params.push(id);
    
    db.query(query, params, (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Appointment not found' });
        }
        
        // Create status change notification
        const getAppointmentQuery = `
            SELECT patient_id, doctor_id FROM appointments WHERE id = ?
        `;
        
        db.query(getAppointmentQuery, [id], (err, appointmentResult) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (appointmentResult.length > 0) {
                const { patient_id, doctor_id } = appointmentResult[0];
                const message = `Your appointment status has been updated to: ${status}`;
                
                const notificationQuery = `
                    INSERT INTO appointment_notifications (appointment_id, user_id, notification_type, message)
                    VALUES (?, ?, 'status_change', ?), (?, ?, 'status_change', ?)
                `;
                
                db.query(notificationQuery, [id, patient_id, message, id, doctor_id, message], (err) => {
                    if (err) console.error('Notification creation failed:', err);
                });
            }
        });
        
        res.json({ message: `Appointment ${status} successfully` });
    });
};

// Get upcoming appointments (for dashboard)
exports.getUpcomingAppointments = (req, res) => {
    const { user_id, role } = req.query;
    
    let query = `
        SELECT 
            a.*,
            ${role === 'patient' ? 'd.name as doctor_name, d.specialization' : 'p.name as patient_name, p.phone as patient_phone'}
        FROM 
            appointments a
        JOIN 
            users ${role === 'patient' ? 'd ON a.doctor_id = d.id' : 'p ON a.patient_id = p.id'}
        WHERE 
            a.${role === 'patient' ? 'patient_id' : 'doctor_id'} = ?
            AND a.appointment_date >= CURDATE()
            AND a.status IN ('pending', 'confirmed')
        ORDER BY 
            a.appointment_date ASC, a.appointment_time ASC
        LIMIT 5
    `;
    
    db.query(query, [user_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get appointment statistics (for admin dashboard)
exports.getAppointmentStats = (req, res) => {
    const { period } = req.query; // 'today', 'week', 'month'
    
    let dateFilter = '';
    switch (period) {
        case 'today':
            dateFilter = 'AND a.appointment_date = CURDATE()';
            break;
        case 'week':
            dateFilter = 'AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
            break;
        case 'month':
            dateFilter = 'AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
            break;
        default:
            dateFilter = '';
    }
    
    const query = `
        SELECT 
            COUNT(*) as total_appointments,
            COUNT(CASE WHEN a.status = 'pending' THEN 1 END) as pending_count,
            COUNT(CASE WHEN a.status = 'confirmed' THEN 1 END) as confirmed_count,
            COUNT(CASE WHEN a.status = 'completed' THEN 1 END) as completed_count,
            COUNT(CASE WHEN a.status = 'cancelled' THEN 1 END) as cancelled_count,
            COUNT(CASE WHEN a.status = 'no_show' THEN 1 END) as no_show_count
        FROM 
            appointments a
        WHERE 
            1=1 ${dateFilter}
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results[0]);
    });
};
