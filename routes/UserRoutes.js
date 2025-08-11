// routes/userRoutes.js
const express = require('express');
const { registerUser, loginUser, getUsers, updateUser, deleteUser, forgotPassword, resetPassword } = require('../controllers/userController');
const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/', getUsers);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;