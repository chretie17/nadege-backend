const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const communicationController = require('../controllers/CommunicationController');

// Message routes
router.post('/send-message', communicationController.uploadAttachment, communicationController.sendMessage);
router.get('/messages/:userId', communicationController.getMessages);
router.get('/conversation/:user1/:user2', communicationController.getConversation);

// Message read status routes
router.put('/mark-read/:messageId', communicationController.markAsRead); // Legacy route
router.put('/mark-message-read/:messageId', communicationController.markMessageAsRead); // New route with user validation
router.put('/mark-conversation-read/:userId/:otherUserId', communicationController.markConversationAsRead);

// Notification routes
router.post('/create-notification', communicationController.createNotification);
router.post('/send-notification', communicationController.sendNotificationToUser);
router.get('/notifications/:userId', communicationController.getNotifications);
router.put('/mark-notification-read/:notificationId', communicationController.markNotificationAsRead);

// Utility routes
router.get('/unread-count/:userId', communicationController.getUnreadCount);
router.get('/chat-users', communicationController.getChatUsers);

router.get('/attachment/:filename', (req, res) => {
    const filename = req.params.filename;
    // Use absolute path from project root
    const filepath = path.join(process.cwd(), 'uploads', 'attachments', filename);
    
    console.log('Requested file:', filename);
    console.log('Looking for file at:', filepath);
    
    // Check if file exists
    fs.access(filepath, fs.constants.F_OK, (err) => {
        if (err) {
            console.error('File not found:', filepath);
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Set appropriate headers
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        
        // Set content type based on extension
        switch (ext) {
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.png':
                contentType = 'image/png';
                break;
            case '.gif':
                contentType = 'image/gif';
                break;
            case '.pdf':
                contentType = 'application/pdf';
                break;
            case '.doc':
                contentType = 'application/msword';
                break;
            case '.docx':
                contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                break;
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline'); // For preview, use 'attachment' for download
        
        // Send the file
        res.sendFile(filepath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                res.status(500).json({ error: 'Error serving file' });
            }
        });
    });
});

// Alternative route for forced download
router.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(process.cwd(), 'uploads', 'attachments', filename);
    
    fs.access(filepath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        res.setHeader('Content-Disposition', 'attachment'); // Force download
        res.sendFile(filepath);
    });
});


module.exports = router;