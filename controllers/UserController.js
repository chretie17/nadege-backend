const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const SECRET_KEY = '3e3df6981536654df2f807e5ef586aa24a333e3a9822617e014a0a249a180e7b445c782776005d40364569e396dce4fa34496f416ec8e5688e33291e320e5d31';

// Email configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'tyisinad01@gmail.com',
        pass: process.env.EMAIL_PASS || 'wlbh ywne uuvp hfkl'
    }
});

exports.registerUser = async (req, res) => {
    const { username, name, email, password, role, phone, address, specialization, experience, education } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
        'INSERT INTO users (username, name, email, password, role, phone, address, specialization, experience, education) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [username, name, email, hashedPassword, role, phone, address, specialization, experience, education],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'User registered successfully!' });
        }
    );
};

exports.loginUser = (req, res) => {
    const { usernameOrEmail, password } = req.body;
    db.query('SELECT * FROM users WHERE email = ? OR username = ?', [usernameOrEmail, usernameOrEmail], async (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(401).json({ message: 'User not found' });
        
        const user = results[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(401).json({ message: 'Invalid password' });
        
        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ 
            message: 'Login successful',
            token,
            role: user.role,
            user: { id: user.id, name: user.name, email: user.email, username: user.username, phone: user.phone, address: user.address, specialization: user.specialization, experience: user.experience, education: user.education }
        });
    });
};

exports.getUsers = (req, res) => {
    db.query('SELECT id, username, name, email, role, phone, address, specialization, experience, education FROM users', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

exports.updateUser = (req, res) => {
    const { id } = req.params;
    const { username, name, email, phone, address, specialization, experience, education } = req.body;
    db.query(
        'UPDATE users SET username = ?, name = ?, email = ?, phone = ?, address = ?, specialization = ?, experience = ?, education = ? WHERE id = ?',
        [username, name, email, phone, address, specialization, experience, education, id],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'User updated successfully' });
        }
    );
};

exports.deleteUser = (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User deleted successfully' });
    });
};

// Password Reset Request
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length === 0) {
            return res.status(404).json({ message: 'User with this email does not exist' });
        }

        const user = results[0];
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
        
        // Store reset token in database
        db.query(
            'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?',
            [resetToken, resetTokenExpiry, user.id],
            async (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                
                // Send reset email
                const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;
                
                const mailOptions = {
                    from: process.env.EMAIL_USER || 'tyisinad01@gmail.com',
                    to: email,
                    subject: 'Password Reset Request',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #333;">Password Reset Request</h2>
                            <p>Hello ${user.name},</p>
                            <p>You have requested to reset your password. Please click the link below to reset your password:</p>
                            <div style="margin: 20px 0;">
                                <a href="${resetUrl}" 
                                   style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                   Reset Password
                                </a>
                            </div>
                            <p>Or copy and paste this link in your browser:</p>
                            <p style="word-break: break-all; color: #007bff;">${resetUrl}</p>
                            <p style="color: #666; font-size: 14px;">
                                This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
                            </p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="color: #999; font-size: 12px;">
                                This is an automated email. Please do not reply to this email.
                            </p>
                        </div>
                    `
                };
                
                try {
                    await transporter.sendMail(mailOptions);
                    res.json({ 
                        message: 'Password reset email sent successfully. Please check your email.',
                        success: true 
                    });
                } catch (emailError) {
                    console.error('Email sending error:', emailError);
                    res.status(500).json({ 
                        message: 'Error sending reset email. Please try again later.',
                        error: emailError.message 
                    });
                }
            }
        );
    });
};

// Reset Password
exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token and new password are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    db.query(
        'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?',
        [token, new Date()],
        async (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (results.length === 0) {
                return res.status(400).json({ message: 'Invalid or expired reset token' });
            }

            const user = results[0];
            
            try {
                // Hash the new password
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                
                // Update password and clear reset token
                db.query(
                    'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
                    [hashedPassword, user.id],
                    (err, result) => {
                        if (err) return res.status(500).json({ error: err.message });
                        
                        res.json({ 
                            message: 'Password reset successfully! You can now login with your new password.',
                            success: true 
                        });
                    }
                );
            } catch (hashError) {
                res.status(500).json({ 
                    message: 'Error processing password reset',
                    error: hashError.message 
                });
            }
        }
    );
};