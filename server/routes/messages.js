import express from 'express';
import { 
  sendBulkMessage, 
  getCampaignStats, 
  getMessageHistory 
} from '../controllers/campaignController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

router.post('/send-bulk', sendBulkMessage);
router.get('/stats', getCampaignStats);
router.get('/history', getMessageHistory);

export default router;