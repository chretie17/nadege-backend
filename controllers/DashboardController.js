const db = require('../config/db');

// Get dashboard data
exports.getDashboardData = (req, res) => {
    const { userId, role } = req.query;
    
    if (!userId || !role) {
        return res.status(400).json({ error: 'User ID and role are required' });
    }
    
    // Get basic stats
    const statsQuery = `
        SELECT 
            (SELECT COUNT(*) FROM users WHERE role = 'patient') as total_patients,
            (SELECT COUNT(*) FROM users WHERE role = 'doctor') as total_doctors,
            (SELECT COUNT(*) FROM appointments WHERE status = 'pending') as pending_appointments,
            (SELECT COUNT(*) FROM appointments WHERE status = 'confirmed') as confirmed_appointments,
            (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURDATE()) as today_appointments,
            (SELECT COUNT(*) FROM forum_topics WHERE status = 'active') as active_topics,
            (SELECT COUNT(*) FROM success_stories WHERE is_approved = true) as success_stories
    `;
    
    // Get recent appointments based on role
    let recentAppointmentsQuery;
    let queryParams = [];
    
    if (role === 'admin') {
        recentAppointmentsQuery = `
            SELECT 
                a.id,
                a.appointment_date,
                a.appointment_time,
                a.status,
                p.name as patient_name,
                d.name as doctor_name,
                a.created_at
            FROM appointments a
            JOIN users p ON a.patient_id = p.id
            JOIN users d ON a.doctor_id = d.id
            ORDER BY a.created_at DESC
            LIMIT 10
        `;
    } else if (role === 'doctor') {
        recentAppointmentsQuery = `
            SELECT 
                a.id,
                a.appointment_date,
                a.appointment_time,
                a.status,
                p.name as patient_name,
                a.created_at
            FROM appointments a
            JOIN users p ON a.patient_id = p.id
            WHERE a.doctor_id = ?
            ORDER BY a.appointment_date ASC, a.appointment_time ASC
            LIMIT 10
        `;
        queryParams = [userId];
    } else if (role === 'patient') {
        recentAppointmentsQuery = `
            SELECT 
                a.id,
                a.appointment_date,
                a.appointment_time,
                a.status,
                d.name as doctor_name,
                d.specialization,
                a.created_at
            FROM appointments a
            JOIN users d ON a.doctor_id = d.id
            WHERE a.patient_id = ?
            ORDER BY a.appointment_date ASC, a.appointment_time ASC
            LIMIT 10
        `;
        queryParams = [userId];
    }
    
    // Get unread messages count
    const unreadMessagesQuery = `
        SELECT COUNT(*) as unread_messages
        FROM messages
        WHERE receiver_id = ? AND is_read = false
    `;
    
    // Get unread notifications count
    const unreadNotificationsQuery = `
        SELECT COUNT(*) as unread_notifications
        FROM notifications
        WHERE user_id = ? AND is_read = false
    `;
    
    // Execute all queries
    db.query(statsQuery, (err, statsResults) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query(recentAppointmentsQuery, queryParams, (err, appointmentsResults) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.query(unreadMessagesQuery, [userId], (err, messagesResults) => {
                if (err) return res.status(500).json({ error: err.message });
                
                db.query(unreadNotificationsQuery, [userId], (err, notificationsResults) => {
                    if (err) return res.status(500).json({ error: err.message });
                    
                    res.json({
                        stats: statsResults[0],
                        recent_appointments: appointmentsResults,
                        unread_messages: messagesResults[0].unread_messages,
                        unread_notifications: notificationsResults[0].unread_notifications
                    });
                });
            });
        });
    });
};

// Get user profile summary
exports.getUserProfile = (req, res) => {
    const { userId } = req.params;
    
    const query = `
        SELECT 
            id,
            name,
            username,
            email,
            phone,
            role,
            specialization,
            experience,
            education,
            date_of_birth,
            address,
            created_at
        FROM users
        WHERE id = ?
    `;
    
    db.query(query, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(results[0]);
    });
};

// Get quick stats for role-specific dashboard
exports.getQuickStats = (req, res) => {
    const { userId, role } = req.query;
    
    if (role === 'doctor') {
        const query = `
            SELECT 
                COUNT(*) as total_appointments,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_appointments,
                COUNT(CASE WHEN appointment_date = CURDATE() THEN 1 END) as today_appointments,
                COUNT(CASE WHEN appointment_date >= CURDATE() AND appointment_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as week_appointments
            FROM appointments
            WHERE doctor_id = ?
        `;
        
        db.query(query, [userId], (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results[0]);
        });
    } else if (role === 'patient') {
        const query = `
            SELECT 
                COUNT(*) as total_appointments,
                COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_appointments,
                COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_appointments,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments
            FROM appointments
            WHERE patient_id = ?
        `;
        
        db.query(query, [userId], (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results[0]);
        });
    } else {
        // Admin stats
        const query = `
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'patient') as total_patients,
                (SELECT COUNT(*) FROM users WHERE role = 'doctor') as total_doctors,
                (SELECT COUNT(*) FROM appointments WHERE status = 'pending') as pending_appointments,
                (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURDATE()) as today_appointments
        `;
        
        db.query(query, (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results[0]);
        });
    }
};