const db = require('../config/db');

// Get notifications for a specific user
exports.getUserNotifications = (req, res) => {
    const { user_id } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    const query = `
        SELECT 
            an.id,
            an.appointment_id,
            an.notification_type,
            an.message,
            an.is_read,
            an.sent_at,
            a.appointment_date,
            a.appointment_time,
            a.status as appointment_status,
            CASE 
                WHEN an.notification_type = 'booking_confirmation' AND u.role = 'patient' THEN d.name
                WHEN an.notification_type = 'booking_confirmation' AND u.role = 'doctor' THEN p.name
                WHEN an.notification_type = 'status_change' AND u.role = 'patient' THEN d.name
                WHEN an.notification_type = 'status_change' AND u.role = 'doctor' THEN p.name
                ELSE NULL
            END as related_user_name,
            CASE 
                WHEN an.notification_type = 'booking_confirmation' AND u.role = 'patient' THEN d.specialization
                WHEN an.notification_type = 'booking_confirmation' AND u.role = 'doctor' THEN NULL
                WHEN an.notification_type = 'status_change' AND u.role = 'patient' THEN d.specialization
                WHEN an.notification_type = 'status_change' AND u.role = 'doctor' THEN NULL
                ELSE NULL
            END as doctor_specialization
        FROM 
            appointment_notifications an
        JOIN 
            users u ON an.user_id = u.id
        LEFT JOIN 
            appointments a ON an.appointment_id = a.id
        LEFT JOIN 
            users d ON a.doctor_id = d.id
        LEFT JOIN 
            users p ON a.patient_id = p.id
        WHERE 
            an.user_id = ?
        ORDER BY 
            an.sent_at DESC
        LIMIT ? OFFSET ?
    `;
    
    db.query(query, [user_id, parseInt(limit), parseInt(offset)], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Format the results
        const formattedResults = results.map(notification => ({
            ...notification,
            sent_at: new Date(notification.sent_at).toISOString(),
            appointment_date: notification.appointment_date ? new Date(notification.appointment_date).toISOString().split('T')[0] : null,
            appointment_time: notification.appointment_time ? formatTime(notification.appointment_time) : null
        }));
        
        res.json(formattedResults);
    });
};

// Get unread notification count for a user
exports.getUnreadCount = (req, res) => {
    const { user_id } = req.params;
    
    const query = `
        SELECT COUNT(*) as unread_count
        FROM appointment_notifications
        WHERE user_id = ? AND is_read = false
    `;
    
    db.query(query, [user_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ unread_count: results[0].unread_count });
    });
};

// Mark a notification as read
exports.markAsRead = (req, res) => {
    const { notification_id } = req.params;
    const { user_id } = req.body;
    
    const query = `
        UPDATE appointment_notifications 
        SET is_read = true, read_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
    `;
    
    db.query(query, [notification_id, user_id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Notification not found or access denied' });
        }
        
        res.json({ message: 'Notification marked as read' });
    });
};

// Mark all notifications as read for a user
exports.markAllAsRead = (req, res) => {
    const { user_id } = req.params;
    
    const query = `
        UPDATE appointment_notifications 
        SET is_read = true, read_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND is_read = false
    `;
    
    db.query(query, [user_id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({ 
            message: 'All notifications marked as read',
            updated_count: result.affectedRows
        });
    });
};

// Delete a notification
exports.deleteNotification = (req, res) => {
    const { notification_id } = req.params;
    const { user_id } = req.body;
    
    const query = `
        DELETE FROM appointment_notifications 
        WHERE id = ? AND user_id = ?
    `;
    
    db.query(query, [notification_id, user_id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Notification not found or access denied' });
        }
        
        res.json({ message: 'Notification deleted successfully' });
    });
};

// Create a custom notification (for admin use)
exports.createNotification = (req, res) => {
    const { user_id, appointment_id, notification_type, message } = req.body;
    
    if (!user_id || !notification_type || !message) {
        return res.status(400).json({ 
            error: 'User ID, notification type, and message are required' 
        });
    }
    
    const validTypes = ['booking_confirmation', 'status_change', 'reminder', 'system', 'custom'];
    if (!validTypes.includes(notification_type)) {
        return res.status(400).json({ error: 'Invalid notification type' });
    }
    
    const query = `
        INSERT INTO appointment_notifications (user_id, appointment_id, notification_type, message)
        VALUES (?, ?, ?, ?)
    `;
    
    db.query(query, [user_id, appointment_id || null, notification_type, message], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.status(201).json({
            message: 'Notification sent successfully',
            notification_id: result.insertId
        });
    });
};

// Get recent notifications for dashboard
exports.getRecentNotifications = (req, res) => {
    const { user_id } = req.params;
    const limit = 5; // Fixed limit for recent notifications
    
    const query = `
        SELECT 
            an.id,
            an.appointment_id,
            an.notification_type,
            an.message,
            an.is_read,
            an.sent_at,
            a.appointment_date,
            a.appointment_time
        FROM 
            appointment_notifications an
        LEFT JOIN 
            appointments a ON an.appointment_id = a.id
        WHERE 
            an.user_id = ?
        ORDER BY 
            an.sent_at DESC
        LIMIT ?
    `;
    
    db.query(query, [user_id, limit], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const formattedResults = results.map(notification => ({
            ...notification,
            sent_at: new Date(notification.sent_at).toISOString(),
            appointment_date: notification.appointment_date ? new Date(notification.appointment_date).toISOString().split('T')[0] : null,
            appointment_time: notification.appointment_time ? formatTime(notification.appointment_time) : null,
            time_ago: getTimeAgo(notification.sent_at)
        }));
        
        res.json(formattedResults);
    });
};

// Helper function to format time
function formatTime(timeString) {
    if (!timeString) return '';
    
    const time = new Date(`2000-01-01 ${timeString}`);
    return time.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

// Helper function to get time ago
function getTimeAgo(date) {
    const now = new Date();
    const notificationDate = new Date(date);
    const diffInMs = now - notificationDate;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    
    if (diffInMinutes < 1) {
        return 'Just now';
    } else if (diffInMinutes < 60) {
        return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    } else if (diffInHours < 24) {
        return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else if (diffInDays < 7) {
        return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    } else {
        return notificationDate.toLocaleDateString();
    }
}

module.exports = exports;