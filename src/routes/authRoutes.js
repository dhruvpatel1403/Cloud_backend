import express from 'express';
import { register, confirmUser, login } from '../controllers/authController.js';

const router = express.Router();

// POST /auth/register
router.post('/register', register);

// POST /auth/confirm
router.post('/confirm', confirmUser);

// POST /auth/login
router.post('/login', login);

export default router;
