import express from 'express';
import { login, register, validateToken } from '../controllers/authController.js';
import { validateLogin } from '../middleware/validation.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', validateLogin, login);
router.post('/register', register);
router.get('/validate', authenticateToken, validateToken);

export default router;