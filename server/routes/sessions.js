import express from 'express';
import Session from '../models/Session.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get user sessions
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    
    const sessions = await Session.find({ 
      userId,
      status: { $ne: 'disconnected' }
    }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      sessions,
      count: sessions.length
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete session
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;
    
    await Session.deleteOne({ sessionId, userId });
    
    res.json({
      success: true,
      message: 'Session deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;