const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SECRET_KEY = '3e3df6981536654df2f807e5ef586aa24a333e3a9822617e014a0a249a180e7b445c782776005d40364569e396dce4fa34496f416ec8e5688e33291e320e5d31';

exports.registerUser = async (req, res) => {
    const { username, name, email, password, role, phone, address, skills, experience, education } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
        'INSERT INTO users (username, name, email, password, role, phone, address, skills, experience, education) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [username, name, email, hashedPassword, role, phone, address, skills, experience, education],
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
            user: { id: user.id, name: user.name, email: user.email, username: user.username, phone: user.phone, address: user.address, skills: user.skills, experience: user.experience, education: user.education }
        });
    });
};

exports.getUsers = (req, res) => {
    db.query('SELECT id, username, name, email, role, phone, address, skills, experience, education FROM users', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

exports.updateUser = (req, res) => {
    const { id } = req.params;
    const { username, name, email, phone, address, skills, experience, education } = req.body;
    db.query(
        'UPDATE users SET username = ?, name = ?, email = ?, phone = ?, address = ?, skills = ?, experience = ?, education = ? WHERE id = ?',
        [username, name, email, phone, address, skills, experience, education, id],
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
