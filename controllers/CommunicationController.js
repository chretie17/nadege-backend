const db = require('../config/db');

// Send a message
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/attachments';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Allow common file types
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// MODIFY your existing sendMessage function to handle attachments:
exports.sendMessage = (req, res) => {
    const { sender_id, receiver_id, message, message_type } = req.body;
    let attachment_url = null;
    let attachment_name = null;
    let attachment_type = null;
    let attachment_size = null;
    
    // Handle file attachment if present
    if (req.file) {
        attachment_url = `/uploads/attachments/${req.file.filename}`;
        attachment_name = req.file.originalname;
        attachment_type = req.file.mimetype;
        attachment_size = req.file.size;
    }
    
    const query = `INSERT INTO messages (sender_id, receiver_id, message, message_type, attachment_url, attachment_name, attachment_type, attachment_size) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(query, [sender_id, receiver_id, message, message_type || 'direct', attachment_url, attachment_name, attachment_type, attachment_size], (err, results) => {
        if (err) {
            console.error('Error sending message:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Rest of your existing sendMessage logic...
        // But also include attachment info in the real-time message
        if (receiver_id && req.connectedUsers.has(receiver_id.toString())) {
            const receiverSocketId = req.connectedUsers.get(receiver_id.toString());
            
            req.io.to(receiverSocketId).emit('new_message', {
                id: results.insertId,
                sender_id: parseInt(sender_id),
                sender_name: senderName,
                message,
                message_type,
                attachment_url,
                attachment_name,
                attachment_type,
                attachment_size,
                created_at: new Date().toISOString()
            });
        }
        
        res.status(201).json({ 
            message: 'Message sent successfully', 
            messageId: results.insertId,
            attachment: req.file ? {
                url: attachment_url,
                name: attachment_name,
                type: attachment_type,
                size: attachment_size
            } : null
        });
    });
};

exports.uploadAttachment = upload.single('attachment');

// Get messages for a user
exports.getMessages = (req, res) => {
    const { userId } = req.params;
    
    const query = `
        SELECT m.*, 
               u1.username as sender_name,
               u2.username as receiver_name
        FROM messages m
        LEFT JOIN users u1 ON m.sender_id = u1.id
        LEFT JOIN users u2 ON m.receiver_id = u2.id
        WHERE m.receiver_id = ? OR m.sender_id = ? OR m.message_type = 'broadcast'
        ORDER BY m.created_at DESC
    `;
    
    db.query(query, [userId, userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(results);
    });
};

// Get conversation between two users
exports.getConversation = (req, res) => {
    const { user1, user2 } = req.params;
    
    const query = `
        SELECT m.*, u.username as sender_name, m.is_read
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.created_at ASC
    `;
    
    db.query(query, [user1, user2, user2, user1], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(results);
    });
};

// Mark single message as read - UPDATED
exports.markMessageAsRead = (req, res) => {
    const { messageId } = req.params;
    const { userId } = req.body; // Get user ID from request body
    
    // Only mark as read if the current user is the receiver
    const query = 'UPDATE messages SET is_read = TRUE WHERE id = ? AND receiver_id = ?';
    db.query(query, [messageId, userId], (err, results) => {
        if (err) {
            console.error('Error marking message as read:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Message not found or you are not the receiver' });
        }
        
        console.log(`Message ${messageId} marked as read by user ${userId}`);
        res.status(200).json({ message: 'Message marked as read', messageId: messageId });
    });
};

// Mark entire conversation as read
exports.markConversationAsRead = (req, res) => {
    const { userId, otherUserId } = req.params;
    
    const query = `
        UPDATE messages 
        SET is_read = TRUE 
        WHERE receiver_id = ? AND sender_id = ? AND is_read = FALSE
    `;
    
    db.query(query, [userId, otherUserId], (err, results) => {
        if (err) {
            console.error('Error marking conversation as read:', err);
            return res.status(500).json({ error: err.message });
        }
        
        console.log(`Marked ${results.affectedRows} messages as read for user ${userId} from user ${otherUserId}`);
        res.status(200).json({ 
            message: 'Conversation marked as read',
            messagesUpdated: results.affectedRows
        });
    });
};

// Mark message as read (legacy method)
exports.markAsRead = (req, res) => {
    const { messageId } = req.params;
    
    const query = 'UPDATE messages SET is_read = TRUE WHERE id = ?';
    db.query(query, [messageId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ message: 'Message marked as read' });
    });
};

// Create notification
exports.createNotification = (req, res) => {
    const { user_id, title, message, type, related_id, related_type } = req.body;
    
    const query = 'INSERT INTO notifications (user_id, title, message, type, related_id, related_type) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(query, [user_id, title, message, type || 'info', related_id || null, related_type || null], (err, results) => {
        if (err) {
            console.error('Error creating notification:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Send real-time popup notification
        if (req.connectedUsers.has(user_id.toString())) {
            const userSocketId = req.connectedUsers.get(user_id.toString());
            console.log(`Sending notification to user ${user_id} via socket ${userSocketId}`);
            
            req.io.to(userSocketId).emit('new_notification', {
                id: results.insertId,
                title,
                message,
                type: type || 'info',
                created_at: new Date().toISOString()
            });
        }
        
        res.status(201).json({ message: 'Notification created successfully', notificationId: results.insertId });
    });
};

// Get notifications for a user
exports.getNotifications = (req, res) => {
    const { userId } = req.params;
    
    const query = 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC';
    db.query(query, [userId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(results);
    });
};

// Mark notification as read
exports.markNotificationAsRead = (req, res) => {
    const { notificationId } = req.params;
    
    const query = 'UPDATE notifications SET is_read = TRUE WHERE id = ?';
    db.query(query, [notificationId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json({ message: 'Notification marked as read' });
    });
};

// Get unread count
exports.getUnreadCount = (req, res) => {
    const { userId } = req.params;
    
    const messageQuery = 'SELECT COUNT(*) as unread_messages FROM messages WHERE receiver_id = ? AND is_read = FALSE';
    const notificationQuery = 'SELECT COUNT(*) as unread_notifications FROM notifications WHERE user_id = ? AND is_read = FALSE';
    
    db.query(messageQuery, [userId], (err, messageResults) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.query(notificationQuery, [userId], (err, notificationResults) => {
            if (err) return res.status(500).json({ error: err.message });
            
            res.status(200).json({
                unread_messages: messageResults[0].unread_messages,
                unread_notifications: notificationResults[0].unread_notifications
            });
        });
    });
};

// Get all users for chat
exports.getChatUsers = (req, res) => {
    const query = 'SELECT id, username, name, role FROM users ORDER BY username';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(200).json(results);
    });
};

// Send notification to specific user
exports.sendNotificationToUser = (req, res) => {
    const { userId, title, message, type, related_id, related_type } = req.body;
    
    const query = 'INSERT INTO notifications (user_id, title, message, type, related_id, related_type) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(query, [userId, title, message, type || 'info', related_id || null, related_type || null], (err, results) => {
        if (err) {
            console.error('Error sending notification to user:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Send real-time popup notification
        if (req.connectedUsers.has(userId.toString())) {
            const userSocketId = req.connectedUsers.get(userId.toString());
            console.log(`Sending notification to user ${userId} via socket ${userSocketId}`);
            
            req.io.to(userSocketId).emit('new_notification', {
                id: results.insertId,
                title,
                message,
                type: type || 'info',
                created_at: new Date().toISOString()
            });
        }
        
        res.status(201).json({ message: 'Notification sent successfully' });
    });
};