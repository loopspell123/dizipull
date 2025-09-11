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

// Send messages to phone numbers
router.post('/send-to-numbers', auth, async (req, res) => {
  try {
    const { sessionId, contacts, message } = req.body;
    const userId = req.user._id;

    if (!sessionId || !contacts || !message || !Array.isArray(contacts)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get session
    const session = await sessionManager.getSessionById(sessionId, userId);
    if (!session || session.status !== 'connected') {
      return res.status(400).json({ error: 'Session not found or not connected' });
    }

    // Create campaign for tracking
    const campaignId = `number_campaign_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    console.log(`📞 Starting number campaign: ${campaignId} with ${contacts.length} contacts`);

    // Send messages to each contact
    const results = [];
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      
      try {
        // Format number for WhatsApp (ensure country code)
        let phoneNumber = contact.number.replace(/[^\d+]/g, '');
        if (!phoneNumber.startsWith('+')) {
          // If no country code, you might want to add a default one
          phoneNumber = phoneNumber.replace(/^0+/, ''); // Remove leading zeros
        }
        phoneNumber = phoneNumber.replace('+', '') + '@c.us';

        console.log(`📞 Sending to ${contact.name} (${phoneNumber})...`);
        
        const client = sessionManager.getClient(sessionId);
        if (!client) {
          throw new Error('WhatsApp client not available');
        }

        const result = await client.sendMessage(phoneNumber, message);
        
        if (result) {
          console.log(`✅ Message sent to ${contact.name}`);
          results.push({
            contact: contact.name,
            number: contact.number,
            success: true,
            messageId: result.id
          });

          // Log successful message
          await MessageLog.create({
            userId: userId,
            sessionId: sessionId,
            recipient: phoneNumber,
            recipientName: contact.name,
            messageContent: message,
            status: 'sent',
            timestamp: new Date(),
            campaignId: campaignId
          });
        }

        // Add delay between messages to avoid rate limiting
        if (i < contacts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.log(`❌ Failed to send to ${contact.name}:`, error.message);
        results.push({
          contact: contact.name,
          number: contact.number,
          success: false,
          error: error.message
        });

        // Log failed message
        await MessageLog.create({
          userId: userId,
          sessionId: sessionId,
          recipient: contact.number + '@c.us',
          recipientName: contact.name,
          messageContent: message,
          status: 'failed',
          error: error.message,
          timestamp: new Date(),
          campaignId: campaignId
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    console.log(`🏁 Number campaign completed: ${successCount} success, ${failCount} failed`);

    res.json({
      success: true,
      campaignId,
      results,
      summary: {
        total: contacts.length,
        success: successCount,
        failed: failCount
      }
    });

  } catch (error) {
    console.error('Error sending messages to numbers:', error);
    res.status(500).json({ error: 'Error sending messages' });
  }
});

module.exports = router;