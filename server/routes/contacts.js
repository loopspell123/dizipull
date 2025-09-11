import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { authenticateToken } from '../middleware/auth.js';
import MessageLog from '../models/MessageLog.js';
import CampaignLog from '../models/CampaignLog.js';
import NumberCampaign from '../models/NumberCampaign.js';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'));
    }
  }
});

// Upload and parse Excel file
router.post('/upload', authenticateToken, upload.single('excel'), async (req, res) => {
  try {
    console.log('📊 Excel upload request received');
    
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📁 File details:', {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });

    let workbook, worksheet, data;
    
    try {
      console.log('📖 Reading Excel file...');
      workbook = XLSX.readFile(req.file.path);
      console.log('📋 Available sheets:', workbook.SheetNames);
      
      const sheetName = workbook.SheetNames[0];
      worksheet = workbook.Sheets[sheetName];
      
      console.log('🔄 Converting sheet to JSON...');
      data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      console.log('📊 Raw data rows:', data.length);
      
    } catch (excelError) {
      console.error('❌ Excel reading error:', excelError);
      throw new Error(`Failed to read Excel file: ${excelError.message}`);
    }

    if (!data || data.length === 0) {
      throw new Error('Excel file is empty or has no data');
    }

    console.log('📝 Sample row:', data[0]);
    console.log('📝 Available columns:', Object.keys(data[0] || {}));

    // Parse contacts from Excel data with comprehensive column detection
    const contacts = [];
    
    for (let index = 0; index < data.length; index++) {
      const row = data[index];
      
      // Comprehensive name detection
      const name = row.Name || row.name || row.NAME || 
                   row.Contact || row.contact || row.CONTACT ||
                   row.ContactName || row.contactname || row.CONTACTNAME ||
                   row['Contact Name'] || row['contact name'] || row['CONTACT NAME'] ||
                   row['Full Name'] || row['full name'] || row['FULL NAME'] ||
                   row.Client || row.client || row.CLIENT ||
                   row.Customer || row.customer || row.CUSTOMER ||
                   `Contact ${index + 1}`;
      
      // Comprehensive number detection - EXPANDED TO INCLUDE YOUR COLUMN
      let number = row.Number || row.number || row.NUMBER || 
                   row.Phone || row.phone || row.PHONE ||
                   row.Mobile || row.mobile || row.MOBILE ||
                   row.WhatsApp || row.whatsapp || row.WHATSAPP ||
                   row.PhoneNumber || row.phonenumber || row.PHONENUMBER ||
                   row['Phone Number'] || row['phone number'] || row['PHONE NUMBER'] ||
                   row['Phone Numbers'] || row['phone numbers'] || row['PHONE NUMBERS'] ||
                   row['Mobile Number'] || row['mobile number'] || row['MOBILE NUMBER'] ||
                   row['Mobile Numbers'] || row['mobile numbers'] || row['MOBILE NUMBERS'] ||
                   row.Cell || row.cell || row.CELL ||
                   row.Telephone || row.telephone || row.TELEPHONE ||
                   row.Tel || row.tel || row.TEL ||
                   row.Contact_Number || row.contact_number || row.CONTACT_NUMBER ||
                   row.Mob || row.mob || row.MOB;

      console.log(`Row ${index + 1}: Name="${name}", Number="${number}", Available keys:`, Object.keys(row));

      if (number) {
        // Clean and validate number
        number = String(number).trim();
        
        // Remove common formatting
        number = number.replace(/[\s\-\(\)\.]/g, '');
        
        // Keep only digits and + sign
        number = number.replace(/[^\d+]/g, '');
        
        // Add country code if missing (assuming India +91)
        if (!number.startsWith('+')) {
          if (number.startsWith('91') && number.length === 12) {
            number = '+' + number;
          } else if (number.length === 10) {
            number = '+91' + number;
          } else if (number.length >= 7 && number.length <= 15) {
            // Keep as is for international numbers
            if (!number.startsWith('+')) {
              // Try to add + for international format
              number = '+' + number;
            }
          }
        }
        
        // Validate final number length
        if (number.length >= 10 && number.length <= 16) {
          contacts.push({
            name: String(name).trim(),
            number: number
          });
          console.log(`✅ Added contact: ${name} - ${number}`);
        } else {
          console.log(`⚠️ Skipped invalid number: ${number} (length: ${number.length})`);
        }
      } else {
        console.log(`⚠️ No number found in row ${index + 1}:`, Object.keys(row));
      }
    }

    console.log(`✅ Successfully parsed ${contacts.length} contacts from ${data.length} rows`);

    // Clean up uploaded file
    try {
      fs.unlinkSync(req.file.path);
      console.log('🗑️ Cleaned up uploaded file');
    } catch (cleanupError) {
      console.log('⚠️ Could not clean up uploaded file:', cleanupError.message);
    }

    res.json({
      success: true,
      contacts: contacts,
      total: contacts.length,
      originalRows: data.length,
      debug: {
        sampleRow: data[0],
        availableColumns: Object.keys(data[0] || {}),
        detectedContacts: contacts.slice(0, 3) // First 3 for debugging
      }
    });

  } catch (error) {
    console.error('❌ Excel parsing error:', error);
    
    // Clean up file in case of error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.log('⚠️ Could not clean up file after error');
      }
    }
    
    res.status(500).json({ 
      error: 'Error parsing Excel file',
      details: error.message,
      suggestion: 'Make sure your Excel file has Name and Number columns (or Phone, Mobile, Phone Numbers, etc.)'
    });
  }
});

// Send messages to numbers with batching and scheduling
router.post('/send-to-numbers', authenticateToken, async (req, res) => {
  try {
    const { sessionId, contacts, message, delay = 6000, batchSize = 1000, scheduleType = 'immediate', campaignName } = req.body;

    if (!sessionId || !contacts || !message) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, contacts, message'
      });
    }

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        error: 'Contacts must be a non-empty array'
      });
    }

    // Get session manager from app
    const sessionManager = req.app.locals.sessionManager;
    if (!sessionManager) {
      return res.status(500).json({
        error: 'Session manager not available'
      });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session || session.data.userId !== req.user._id.toString()) {
      return res.status(404).json({
        error: 'Session not found or access denied'
      });
    }

    if (session.data.status !== 'connected') {
      return res.status(400).json({
        error: `Session not connected. Current status: ${session.data.status}`
      });
    }

    // Create campaign
    const campaignId = `numbers_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const campaign = new NumberCampaign({
      campaignId,
      userId: req.user._id,
      sessionId,
      name: campaignName || `Number Campaign ${new Date().toLocaleString()}`,
      message,
      contacts: contacts,
      totalContacts: contacts.length,
      batchSize: parseInt(batchSize),
      delay: parseInt(delay),
      scheduleType,
      status: 'queued',
      createdAt: new Date()
    });

    await campaign.save();

    console.log(`📱 Starting number campaign: ${campaignId} with ${contacts.length} contacts`);

    // Divide contacts into batches
    const batches = [];
    for (let i = 0; i < contacts.length; i += batchSize) {
      batches.push(contacts.slice(i, i + batchSize));
    }

    console.log(`📦 Divided ${contacts.length} contacts into ${batches.length} batches of ${batchSize}`);

    // Start processing batches
    processBatches(session, batches, message, delay, campaignId, req.user._id, sessionManager);

    res.json({
      success: true,
      campaignId,
      message: `Campaign started with ${contacts.length} contacts in ${batches.length} batches`,
      batchSize: parseInt(batchSize),
      delay: parseInt(delay),
      estimatedTime: `${Math.ceil((contacts.length * delay) / 1000 / 60)} minutes`
    });

  } catch (error) {
    console.error('❌ Send to numbers error:', error);
    res.status(500).json({
      error: 'Failed to send messages',
      details: error.message
    });
  }
});

// Process batches with delays
async function processBatches(session, batches, message, delay, campaignId, userId, sessionManager) {
  let totalSent = 0;
  let totalFailed = 0;
  let currentBatch = 0;

  try {
    // Update campaign status to running
    await NumberCampaign.findOneAndUpdate(
      { campaignId },
      { 
        status: 'running',
        startedAt: new Date(),
        totalBatches: batches.length
      }
    );

    for (const batch of batches) {
      currentBatch++;
      console.log(`📦 Processing batch ${currentBatch}/${batches.length} with ${batch.length} contacts`);

      // Update campaign progress
      await NumberCampaign.findOneAndUpdate(
        { campaignId },
        { 
          currentBatch: currentBatch,
          lastProcessedAt: new Date()
        }
      );

      // Process each contact in the batch
      for (let i = 0; i < batch.length; i++) {
        const contact = batch[i];
        
        try {
          // Format number for WhatsApp
          let whatsappNumber = contact.number.replace(/[^\d+]/g, '');
          
          // Remove + for WhatsApp format
          if (whatsappNumber.startsWith('+')) {
            whatsappNumber = whatsappNumber.substring(1);
          }
          
          // Add WhatsApp suffix
          const chatId = whatsappNumber + '@c.us';
          
          console.log(`📤 Sending to ${contact.name}: ${contact.number}`);

          // Send message
          await session.client.sendMessage(chatId, message);
          
          // Log success - FIXED: Added all required fields
          await MessageLog.create({
            userId: userId,
            sessionId: session.data.sessionId,
            campaignId: campaignId,
            recipientType: 'number',
            recipientId: contact.number,
            recipientName: contact.name,
            message: message,
            status: 'sent',
            sentAt: new Date()
          });

          totalSent++;
          console.log(`✅ Sent ${totalSent}: ${contact.name} (${contact.number})`);

        } catch (error) {
          console.error(`❌ Failed to send to ${contact.name} (${contact.number}):`, error);
          
          // Log failure - FIXED: Added all required fields
          await MessageLog.create({
            userId: userId,
            sessionId: session.data.sessionId,
            campaignId: campaignId,
            recipientType: 'number',
            recipientId: contact.number,
            recipientName: contact.name,
            message: message,
            status: 'failed',
            error: error.message,
            sentAt: new Date()
          });

          totalFailed++;
        }

        // Delay between messages (6 seconds default)
        if (i < batch.length - 1) {
          console.log(`⏳ Waiting ${delay/1000} seconds before next message...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // Update campaign progress
      await NumberCampaign.findOneAndUpdate(
        { campaignId },
        { 
          sentCount: totalSent,
          failedCount: totalFailed,
          lastProcessedAt: new Date()
        }
      );

      // Longer delay between batches (10 minutes default)
      if (currentBatch < batches.length) {
        const batchDelay = 10 * 60 * 1000; // 10 minutes
        console.log(`📦 Batch ${currentBatch} completed. Waiting ${batchDelay/60000} minutes before next batch...`);
        console.log(`📊 Progress: ${totalSent} sent, ${totalFailed} failed`);
        
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    // Update campaign status to completed
    await NumberCampaign.findOneAndUpdate(
      { campaignId },
      {
        status: 'completed',
        sentCount: totalSent,
        failedCount: totalFailed,
        completedAt: new Date()
      }
    );

    console.log(`🎉 Campaign ${campaignId} completed: ${totalSent} sent, ${totalFailed} failed`);

  } catch (error) {
    console.error(`❌ Campaign ${campaignId} failed:`, error);
    
    // Update campaign status to failed
    await NumberCampaign.findOneAndUpdate(
      { campaignId },
      {
        status: 'failed',
        sentCount: totalSent,
        failedCount: totalFailed,
        errorMessage: error.message,
        completedAt: new Date()
      }
    );
  }
}

// Get campaign status
router.get('/campaign/:campaignId/status', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const campaign = await NumberCampaign.findOne({ 
      campaignId,
      userId: req.user._id 
    });

    if (!campaign) {
      return res.status(404).json({
        error: 'Campaign not found'
      });
    }

    const messageStats = await MessageLog.aggregate([
      { $match: { campaignId, userId: req.user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      sent: 0,
      failed: 0,
      pending: 0
    };

    messageStats.forEach(stat => {
      stats[stat._id] = stat.count;
    });

    res.json({
      success: true,
      campaign: {
        campaignId: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
        totalContacts: campaign.totalContacts,
        currentBatch: campaign.currentBatch,
        totalBatches: campaign.totalBatches,
        createdAt: campaign.createdAt,
        completedAt: campaign.completedAt,
        sentCount: campaign.sentCount,
        failedCount: campaign.failedCount
      },
      stats
    });

  } catch (error) {
    console.error('Campaign status error:', error);
    res.status(500).json({
      error: 'Failed to get campaign status'
    });
  }
});

// Get recent campaigns
router.get('/campaigns', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const campaigns = await NumberCampaign.find({
      userId: req.user._id
    })
    .sort({ createdAt: -1 })
    .limit(limit);

    // Get message stats for each campaign
    const campaignsWithStats = await Promise.all(campaigns.map(async (campaign) => {
      const messageStats = await MessageLog.aggregate([
        { $match: { campaignId: campaign.campaignId, userId: req.user._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const stats = { sent: 0, failed: 0, pending: 0 };
      messageStats.forEach(stat => {
        stats[stat._id] = stat.count;
      });

      return {
        campaignId: campaign.campaignId,
        name: campaign.name,
        status: campaign.status,
        totalContacts: campaign.totalContacts,
        createdAt: campaign.createdAt,
        completedAt: campaign.completedAt,
        stats
      };
    }));

    res.json({
      success: true,
      campaigns: campaignsWithStats
    });

  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({
      error: 'Failed to get campaigns'
    });
  }
});

// Pause/Resume campaign
router.post('/campaign/:campaignId/pause', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const campaign = await NumberCampaign.findOne({
      campaignId,
      userId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({
        error: 'Campaign not found'
      });
    }

    const newStatus = campaign.status === 'running' ? 'paused' : 'running';
    
    await NumberCampaign.findOneAndUpdate(
      { campaignId },
      { 
        status: newStatus,
        lastProcessedAt: new Date()
      }
    );

    res.json({
      success: true,
      status: newStatus,
      message: `Campaign ${newStatus === 'paused' ? 'paused' : 'resumed'}`
    });

  } catch (error) {
    console.error('Campaign pause/resume error:', error);
    res.status(500).json({
      error: 'Failed to update campaign status'
    });
  }
});

// Delete campaign
router.delete('/campaign/:campaignId', authenticateToken, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const campaign = await NumberCampaign.findOne({
      campaignId,
      userId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({
        error: 'Campaign not found'
      });
    }

    // Delete campaign and related message logs
    await Promise.all([
      NumberCampaign.deleteOne({ campaignId }),
      MessageLog.deleteMany({ campaignId, userId: req.user._id })
    ]);

    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });

  } catch (error) {
    console.error('Campaign delete error:', error);
    res.status(500).json({
      error: 'Failed to delete campaign'
    });
  }
});

export default router;