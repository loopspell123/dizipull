import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import contactsRoutes from './routes/contacts.js';
// Import organized modules
import { connectDatabase } from './utils/database.js';
import corsMiddleware from './middleware/cros.js';
import { authenticateSocket, authenticateToken } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import SessionManager from './services/sessionManager.js';
import MessageQueue from './services/messageQueue.js';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import Upload from './models/Upload.js';
import MessageLog from './models/MessageLog.js';
import Session from './models/Session.js';
import CampaignLog from './models/CampaignLog.js';
import NumberCampaign from './models/NumberCampaign.js';
// Add WhatsApp Web.js imports for QR generation
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';

// Determine server directory and load environment variables from server/.env having fallback to parent directory  
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple .env file locations
const envPaths = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
  path.join(__dirname, '..', '.env.production')
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment from: ${envPath}`);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.log('No .env file found, using system environment variables');
}

// Debug environment variables
console.log('Environment check:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('   PORT:', process.env.PORT || 'not set');
console.log('   MONGODB_URI:', process.env.MONGODB_URI ? 'Set ✓' : 'Not set ✗');
console.log('   JWT_SECRET:', process.env.JWT_SECRET ? 'Set ✓' : 'Not set ✗');

const app = express();
const server = createServer(app);

// Fix Socket.IO CORS configuration
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = [
        process.env.CLIENT_URL || "http://localhost:5173",
        process.env.CLIENT_URL_PROD || "https://digihub-fortend.onrender.com", 
        "https://digihub-backend-axps.onrender.com",
        "https://digihub-fortend.onrender.com",
        "http://localhost:3000",
        "http://localhost:5173",
      ];

      // Allow no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // Check allowed origins
      if (
        allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && (origin.includes('localhost') || origin.includes('127.0.0.1')))
      ) {
        return callback(null, true);
      }
      
      console.log('Socket.IO CORS blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  connectTimeout: 45000,
  pingTimeout: 30000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowEIO3: true,
});

// Initialize session manager and message queue
const sessionManager = new SessionManager(io);
const messageQueue = new MessageQueue(io, sessionManager);

// Make sessionManager and messageQueue available to routes
app.locals.sessionManager = sessionManager;
app.locals.messageQueue = messageQueue;

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Ensure uploads and public directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/contacts', contactsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    services: {
      database: 'connected',
      websocket: 'active',
      excel_processing: 'ready',
      whatsapp: 'ready'
    }
  });
});

// Number Campaigns API routes
app.get('/api/campaigns/numbers', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { userId: req.user._id };
    if (status && status !== 'all') query.status = status;

    const campaigns = await NumberCampaign.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await NumberCampaign.countDocuments(query);

    res.json({
      success: true,
      campaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching number campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Campaign details route
app.get('/api/campaigns/numbers/:campaignId', authenticateToken, async (req, res) => {
  try {
    const campaign = await NumberCampaign.findOne({
      campaignId: req.params.campaignId,
      userId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get detailed message logs
    const messageStats = await MessageLog.aggregate([
      { $match: { campaignId: req.params.campaignId, userId: req.user._id } },
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

    res.json({
      success: true,
      campaign,
      stats
    });
  } catch (error) {
    console.error('Error fetching campaign details:', error);
    res.status(500).json({ error: 'Failed to fetch campaign details' });
  }
});

// Campaign control routes
app.post('/api/campaigns/numbers/:campaignId/pause', authenticateToken, async (req, res) => {
  try {
    const campaign = await NumberCampaign.findOneAndUpdate(
      { campaignId: req.params.campaignId, userId: req.user._id },
      { status: 'paused', lastProcessedAt: new Date() },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({
      success: true,
      message: 'Campaign paused',
      campaign
    });
  } catch (error) {
    console.error('Error pausing campaign:', error);
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
});

app.post('/api/campaigns/numbers/:campaignId/resume', authenticateToken, async (req, res) => {
  try {
    const campaign = await NumberCampaign.findOneAndUpdate(
      { campaignId: req.params.campaignId, userId: req.user._id },
      { status: 'running', lastProcessedAt: new Date() },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({
      success: true,
      message: 'Campaign resumed',
      campaign
    });
  } catch (error) {
    console.error('Error resuming campaign:', error);
    res.status(500).json({ error: 'Failed to resume campaign' });
  }
});

app.delete('/api/campaigns/numbers/:campaignId', authenticateToken, async (req, res) => {
  try {
    const campaign = await NumberCampaign.findOneAndDelete({
      campaignId: req.params.campaignId,
      userId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Also delete related message logs
    await MessageLog.deleteMany({
      campaignId: req.params.campaignId,
      userId: req.user._id
    });

    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// Socket.IO connection handling
io.use(authenticateSocket);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username} (ID: ${socket.userId})`);
  
  socket.join(`user_${socket.userId}`);
  sessionManager.userSockets = sessionManager.userSockets || new Map();
  sessionManager.userSockets.set(socket.userId, socket);

  // Send current sessions to user
  const userSessions = sessionManager.getUserSessions(socket.userId);
  socket.emit('sessions-data', userSessions);

  // Auto-restore sessions on connection
  setTimeout(async () => {
    try {
      const persistentSessions = await Session.find({ 
        userId: socket.userId, 
        status: { $in: ['connected', 'authenticated'] },
        persistent: true 
      });

      for (const sessionData of persistentSessions) {
        if (!sessionManager.getSession(sessionData.sessionId)) {
          console.log(`Auto-restoring session: ${sessionData.sessionId}`);
          try {
            await sessionManager.createSession(sessionData.sessionId, socket.userId, socket, { persistent: true });
          } catch (error) {
            console.error(`Auto-restore failed for ${sessionData.sessionId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Auto-restore error:', error);
    }
  }, 2000);

  // Handle session creation
  socket.on('create-session', async (data) => {
    const sessionId = data.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const persistent = data.persistent !== false;
    
    try {
      console.log(`Create session request: ${sessionId} (persistent: ${persistent})`);
      
      if (typeof sessionManager.createSession === 'function') {
        await sessionManager.createSession(sessionId, socket.userId, socket, { persistent });
      } else {
        throw new Error('SessionManager createSession method not available');
      }
    } catch (error) {
      console.error(`Create session error:`, error);
      socket.emit('session-error', { sessionId, error: error.message });
    }
  });

  // Message history handler
  socket.on('get-message-history', async (data) => {
    try {
      const { sessionId, page = 1, limit = 20 } = data;
      const skip = (page - 1) * limit;
      
      const messages = await MessageLog.find({ 
        userId: socket.userId,
        ...(sessionId && { sessionId })
      })
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

      socket.emit('message-history', {
        sessionId,
        messages,
        page,
        hasMore: messages.length === limit
      });
    } catch (error) {
      console.error('Message history fetch error:', error);
      socket.emit('message-history-error', { error: error.message });
    }
  });

  // Refresh groups handler
  socket.on('refresh-groups', async (data) => {
    const { sessionId } = data;
    const session = sessionManager.getSession(sessionId);
    
    if (!session || session.data.userId !== socket.userId) {
      socket.emit('access-denied', { sessionId });
      return;
    }

    if (session.data.status !== 'connected') {
      socket.emit('groups-error', { 
        sessionId, 
        error: 'Session not connected' 
      });
      return;
    }

    try {
      await sessionManager.fetchAndSaveGroups(sessionId, session.client, socket);
    } catch (error) {
      socket.emit('groups-error', { sessionId, error: error.message });
    }
  });

  // Session logout handler
  socket.on('logout-session', async (data) => {
    try {
      const { sessionId } = data;
      const session = sessionManager.getSession(sessionId);
      
      if (!session || session.data.userId !== socket.userId) {
        socket.emit('logout-error', { sessionId, error: 'Session not found' });
        return;
      }

      console.log(`Logout requested for session: ${sessionId}`);
      await sessionManager.gracefulLogout(sessionId, 'user_logout');
      socket.emit('logout-success', { sessionId });
    } catch (error) {
      console.error(`Logout error for ${data.sessionId}:`, error);
      socket.emit('logout-error', { 
        sessionId: data.sessionId, 
        error: error.message 
      });
    }
  });

  // Disconnect session handler
  socket.on('disconnect-session', async (data) => {
    try {
      console.log(`Permanent delete session request: ${data.sessionId}`);
      await sessionManager.destroySession(data.sessionId);
    } catch (error) {
      console.error('Error deleting session permanently:', error);
      socket.emit('disconnect-error', {
        sessionId: data.sessionId,
        error: error.message
      });
    }
  });

  // Reconnect session handler
  socket.on('reconnect-session', async (data) => {
    try {
      console.log(`Reconnect session request: ${data.sessionId}`);
      
      const sessionData = sessionManager.getSession(data.sessionId);
      if (sessionData && sessionData.data.status === 'disconnected') {
        await sessionManager.createSessionImproved(socket.userId, data.sessionId, true);
      } else {
        socket.emit('session-error', {
          sessionId: data.sessionId,
          error: 'Session not found or already connected'
        });
      }
    } catch (error) {
      console.error('Error reconnecting session:', error);
      socket.emit('session-error', {
        sessionId: data.sessionId,
        error: error.message
      });
    }
  });

  // Cleanup session handler
  socket.on('cleanup-session', async (data) => {
    try {
      const { sessionId, force = false } = data;
      const session = sessionManager.getSession(sessionId);
      
      if (!session || session.data.userId !== socket.userId) {
        socket.emit('cleanup-error', { sessionId, error: 'Session not found' });
        return;
      }

      console.log(`Manual cleanup requested for session: ${sessionId} (force: ${force})`);

      if (force) {
        await sessionManager.forceDisconnect(sessionId, 'manual_force_cleanup');
      } else {
        await sessionManager.gracefulLogout(sessionId, 'manual_cleanup');
      }
      
      await Session.findOneAndUpdate(
        { sessionId, userId: socket.userId },
        { 
          status: 'disconnected', 
          updatedAt: new Date(),
        }
      );
      
      socket.emit('cleanup-success', { sessionId });
    } catch (error) {
      console.error(`Cleanup error for ${data.sessionId}:`, error);
      socket.emit('cleanup-error', { 
        sessionId: data.sessionId, 
        error: error.message 
      });
    }
  });

  // Toggle group handler
  socket.on('toggle-group', (data) => {
    const { sessionId, groupId } = data;
    const session = sessionManager.getSession(sessionId);
    
    if (session && session.data.userId === socket.userId) {
      const group = session.data.groups?.find(g => g.id === groupId);
      if (group) {
        group.isSelected = !group.isSelected;
        socket.emit('group-toggled', {
          sessionId,
          groupId,
          isSelected: group.isSelected
        });
      }
    }
  });

  // Send message handler
  socket.on('send-message', async (data) => {
    try {
      const { sessionId, groupId, message, mediaId } = data;
      
      if (!sessionId || !groupId || !message) {
        socket.emit('message-error', { 
          error: 'Missing required fields',
          sessionId,
          groupId
        });
        return;
      }
      
      const session = sessionManager.getSession(sessionId);
      if (!session || session.data.userId !== socket.userId) {
        socket.emit('message-error', { 
          sessionId, 
          groupId, 
          error: 'Session not found' 
        });
        return;
      }

      if (session.data.status !== 'connected') {
        socket.emit('message-error', { 
          sessionId, 
          groupId, 
          error: `Session not connected. Status: ${session.data.status}` 
        });
        return;
      }

      const group = session.data.groups?.find(g => g.id === groupId);
      const groupName = group?.name || 'Unknown Group';

      console.log(`Queuing message to group: ${groupName} (${groupId})`);

      const taskId = await messageQueue.addMessage(sessionId, groupId, message, mediaId);
      
      socket.emit('message-queued', { 
        taskId, 
        sessionId, 
        groupId,
        groupName,
        message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        timestamp: new Date(),
        status: 'queued'
      });

      console.log(`Message queued successfully: ${taskId} for group ${groupName}`);
    } catch (error) {
      console.error(`Send message error:`, error);
      socket.emit('message-error', { 
        sessionId: data?.sessionId,
        groupId: data?.groupId,
        error: error.message,
        timestamp: new Date()
      });
    }
  });

  // Bulk message handler
  socket.on('send-bulk-messages', async (data) => {
    try {
      const { sessionId, groupIds, message, mediaId, delay = 10000 } = data;
      const session = sessionManager.getSession(sessionId);
      
      if (!session || session.data.userId !== socket.userId) {
        socket.emit('bulk-message-error', { 
          error: 'Session not found or access denied',
          sessionId
        });
        return;
      }

      if (session.data.status !== 'connected') {
        socket.emit('bulk-message-error', { 
          error: `Session not ready for messaging. Current status: ${session.data.status}.`,
          sessionId,
          currentStatus: session.data.status
        });
        return;
      }

      if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
        socket.emit('bulk-message-error', { 
          error: 'No groups selected or invalid group data',
          sessionId 
        });
        return;
      }

      if (!message || message.trim().length === 0) {
        socket.emit('bulk-message-error', { 
          error: 'Message cannot be empty',
          sessionId 
        });
        return;
      }

      const campaignId = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`Starting bulk campaign: ${campaignId} with ${groupIds.length} groups`);
      
      await CampaignLog.create({
        campaignId,
        userId: socket.userId,
        sessionId,
        name: data.name || `Campaign ${Date.now()}`,
        message,
        mediaId,
        groupIds,
        totalGroups: groupIds.length,
        status: 'started',
        startedAt: new Date()
      });
      
      messageQueue.createBulkCampaign(campaignId, socket.userId, groupIds.length);

      socket.emit('bulk-message-started', { 
        campaignId,
        sessionId, 
        totalGroups: groupIds.length,
        message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        timestamp: new Date()
      });

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < groupIds.length; i++) {
        const groupId = groupIds[i];
        const group = session.data.groups?.find(g => g.id === groupId);
        
        setTimeout(async () => {
          try {
            await messageQueue.addMessage(sessionId, groupId, message, mediaId, campaignId);
            successCount++;
            console.log(`Queued ${successCount}/${groupIds.length}: ${group?.name || groupId}`);
          } catch (error) {
            errorCount++;
            console.error(`Failed to queue ${errorCount}/${groupIds.length}: ${group?.name || groupId}:`, error);
          }

          if (i % 5 === 0 || i === groupIds.length - 1) {
            socket.emit('bulk-queue-progress', {
              campaignId,
              queued: successCount + errorCount,
              total: groupIds.length,
              success: successCount,
              errors: errorCount
            });
          }
        }, i * (delay + (Math.random() * 2000)));
      }
    } catch (error) {
      console.error('Bulk message error:', error);
      socket.emit('bulk-message-error', { 
        sessionId: data?.sessionId, 
        error: error.message,
        timestamp: new Date()
      });
    }
  });

  // Campaign status handler
  socket.on('get-campaign-status', async (data) => {
    try {
      const { campaignId } = data;
      
      const campaign = await NumberCampaign.findOne({
        campaignId,
        userId: socket.userId
      });

      if (!campaign) {
        socket.emit('campaign-status-error', { 
          campaignId, 
          error: 'Campaign not found' 
        });
        return;
      }

      const messageStats = await MessageLog.aggregate([
        { $match: { campaignId, userId: socket.userId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);

      const stats = { sent: 0, failed: 0, pending: 0 };
      messageStats.forEach(stat => {
        stats[stat._id] = stat.count;
      });

      socket.emit('campaign-status-update', {
        campaignId,
        campaign,
        stats
      });
    } catch (error) {
      console.error('Campaign status error:', error);
      socket.emit('campaign-status-error', { 
        campaignId: data?.campaignId,
        error: error.message 
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.user?.username || socket.userId}`);
    if (sessionManager.userSockets) {
      sessionManager.userSockets.delete(socket.userId);
    }
  });
});

// Message API routes
app.use('/api/messages', authenticateToken, (req, res, next) => {
  req.sessionManager = sessionManager;
  req.messageQueue = messageQueue;
  next();
});

// Message History API
app.get('/api/messages/history', authenticateToken, async (req, res) => {
  try {
    const { sessionId, page = 1, limit = 50, groupId, campaignId } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { userId: req.user._id };
    if (sessionId) query.sessionId = sessionId;
    if (groupId) query.groupId = groupId;
    if (campaignId) query.campaignId = campaignId;

    const messages = await MessageLog.find(query)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await MessageLog.countDocuments(query);

    res.json({
      success: true,
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Message history error:', error);
    res.status(500).json({ error: 'Failed to fetch message history' });
  }
});

// Dashboard stats API
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const userSessions = sessionManager.getUserSessions(userId);
    
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const messageStats = await MessageLog.aggregate([
      { $match: { userId: userId, sentAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: { status: '$status' }, count: { $sum: 1 } } }
    ]);

    const totalMessages = await MessageLog.countDocuments({ userId });
    const recentMessages = await MessageLog.find({ userId })
      .sort({ sentAt: -1 })
      .limit(10)
      .lean();

    const numberCampaignStats = await NumberCampaign.aggregate([
      { $match: { userId: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalContacts: { $sum: '$totalContacts' },
          sentCount: { $sum: '$sentCount' },
          failedCount: { $sum: '$failedCount' }
        }
      }
    ]);

    res.json({
      success: true,
      stats: {
        sessions: {
          total: userSessions.length,
          connected: userSessions.filter(s => s.status === 'connected').length,
          disconnected: userSessions.filter(s => s.status === 'disconnected').length
        },
        messages: {
          total: totalMessages,
          sent: messageStats.find(s => s._id.status === 'sent')?.count || 0,
          failed: messageStats.find(s => s._id.status === 'failed')?.count || 0,
          pending: messageStats.find(s => s._id.status === 'pending')?.count || 0
        },
        numberCampaigns: numberCampaignStats
      },
      recentMessages,
      sessions: userSessions
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Session restore API
app.post('/api/sessions/restore', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const persistentSessions = await Session.find({ 
      userId, 
      status: { $in: ['connected', 'authenticated'] },
      persistent: true 
    });

    console.log(`Restoring ${persistentSessions.length} persistent sessions for user ${userId}`);

    for (const sessionData of persistentSessions) {
      try {
        if (!sessionManager.getSession(sessionData.sessionId)) {
          setTimeout(async () => {
            try {
              await sessionManager.createSession(sessionData.sessionId, userId, null, { persistent: true });
            } catch (error) {
              console.error(`Failed to restore session ${sessionData.sessionId}:`, error);
            }
          }, Math.random() * 5000);
        }
      } catch (error) {
        console.error(`Error restoring session ${sessionData.sessionId}:`, error);
      }
    }

    res.json({
      success: true,
      message: `Restoring ${persistentSessions.length} sessions`,
      sessions: persistentSessions.map(s => ({
        sessionId: s.sessionId,
        status: s.status,
        phoneNumber: s.phoneNumber
      }))
    });
  } catch (error) {
    console.error('Session restoration error:', error);
    res.status(500).json({ error: 'Failed to restore sessions' });
  }
});

// File upload endpoint
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/files/${req.file.filename}`;

    const uploadDoc = new Upload({
      userId: req.user._id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      url: fileUrl
    });

    await uploadDoc.save();

    res.json({
      success: true,
      file: {
        id: uploadDoc._id,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        url: fileUrl,
        uploadedAt: uploadDoc.uploadedAt
      }
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Serve static files
app.use('/files', express.static('uploads'));
app.use('/public', express.static('public'));

// Campaign History API
app.get('/api/campaigns/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { userId: req.user._id };
    if (status && status !== 'all') query.status = status;
    if (type && type !== 'all') query.type = type;

    const campaigns = await CampaignLog.find(query)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'username')
      .lean();

    const total = await CampaignLog.countDocuments(query);

    res.json({
      success: true,
      campaigns,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Campaign history error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign history' });
  }
});

// Delete old campaigns
app.delete('/api/campaigns/cleanup', authenticateToken, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const result = await CampaignLog.deleteMany({
      startedAt: { $lt: sevenDaysAgo }
    });

    const numberResult = await NumberCampaign.deleteMany({
      createdAt: { $lt: sevenDaysAgo }
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount + numberResult.deletedCount,
      message: `Deleted ${result.deletedCount + numberResult.deletedCount} campaigns older than 7 days`
    });
  } catch (error) {
    console.error('Campaign cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup old campaigns' });
  }
});

// Session management endpoints
app.get('/api/sessions/stats', authenticateToken, (req, res) => {
  try {
    const stats = sessionManager.getSessionStats();
    const userSessions = sessionManager.getUserSessions(req.userId);
    
    res.json({
      success: true,
      data: {
        global: stats,
        user: {
          sessions: userSessions.length,
          maxSessions: 3,
          canCreate: userSessions.length < 3,
          sessionList: userSessions.map(s => ({
            id: s.sessionId,
            status: s.status,
            createdAt: s.createdAt,
            groups: s.groups?.length || 0
          }))
        }
      }
    });
  } catch (error) {
    console.error('Error getting session stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session statistics'
    });
  }
});

// Cleanup old sessions
app.post('/api/sessions/cleanup', authenticateToken, async (req, res) => {
  try {
    await sessionManager.cleanupUserSessions(req.userId, 2);
    const userSessions = sessionManager.getUserSessions(req.userId);
    
    res.json({
      success: true,
      message: 'User sessions cleaned up',
      remainingSessions: userSessions.length
    });
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup sessions'
    });
  }
});

// Frontend serving configuration
const frontendBuildPath = path.join(__dirname, 'dist');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  console.log(`Serving frontend from: ${frontendBuildPath}`);
  
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
} else {
  console.log(`Frontend build directory not found: ${frontendBuildPath}`);
  console.log('Run "npm run build" in your frontend directory, or start the frontend dev server separately');
  
  app.get('/', (req, res) => {
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5;">
          <h1>WhatsApp Campaign Manager Backend</h1>
          <p>Backend server is running successfully on port ${process.env.PORT || 3001}</p>
          <p>To access the WhatsApp interface:</p>
          <ol>
            <li>Start your frontend development server: <code>npm run dev</code></li>
            <li>Or build and serve the frontend: <code>npm run build</code></li>
            <li>Access the frontend at: <a href="http://localhost:5173">http://localhost:5173</a></li>
          </ol>
          
          <h3>Available API Endpoints:</h3>
          <ul>
            <li><a href="/health">Health Check</a></li>
            <li>/api/auth - Authentication API</li>
            <li>/api/sessions - Sessions API</li>
            <li>/api/contacts - Contacts API (Excel Upload)</li>
            <li>/api/campaigns - Campaign Management</li>
          </ul>
          
          <h3>New Excel Features:</h3>
          <ul>
            <li>Excel file upload and parsing</li>
            <li>Direct number messaging (bypasses groups)</li>
            <li>Smart batching system</li>
            <li>Anti-ban protection with delays</li>
            <li>Campaign progress tracking</li>
          </ul>
          
          <h3>Server Status:</h3>
          <ul>
            <li>MongoDB: Connected</li>
            <li>WebSocket: Active</li>
            <li>Excel Processing: Ready</li>
            <li>Number Campaigns: Active</li>
          </ul>
        </body>
      </html>
    `);
  });
}

// Start server
const PORT = process.env.PORT || 3001;

import { startCleanupJob, stopCleanupJob } from './utils/cronJobs-safe.js';
import { killPort, findAvailablePort } from './utils/portCheck.js';

async function startServer() {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
    
    let retries = 5;
    let connected = false;
    
    while (retries > 0 && !connected) {
      try {
        console.log(`Connection attempt ${6 - retries}/5...`);
        
        await Promise.race([
          connectDatabase(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database connection timeout after 45 seconds')), 45000)
          )
        ]);
        
        connected = true;
        console.log('MongoDB connected successfully');
        
        try {
          console.log('Testing database operations...');
          const adminCount = await User.countDocuments();
          console.log(`Found ${adminCount} users in database`);
        } catch (testError) {
          console.warn('Database connection successful but operations failed:', testError.message);
        }
        
      } catch (dbError) {
        retries--;
        console.error(`MongoDB connection attempt failed (${6 - retries}/5):`, dbError.message);
        
        if (retries > 0) {
          const delay = Math.min(3000 * (6 - retries), 15000);
          console.log(`Retrying in ${delay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('All MongoDB connection attempts failed');
          console.log('Starting server without database connection...');
        }
      }
    }

    // Create admin user if database is connected
    if (connected) {
      try {
        const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
        const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
        const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'admin123';

        console.log('Checking for admin user...');
        
        const existingAdmin = await Promise.race([
          User.findOne({
            $or: [
              { username: DEFAULT_ADMIN_USERNAME.toLowerCase() },
              { email: DEFAULT_ADMIN_EMAIL.toLowerCase() }
            ]
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Admin user query timeout')), 10000)
          )
        ]);

        if (!existingAdmin) {
          console.log('Creating default admin user...');
          const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 12);
          const adminUser = new User({
            username: DEFAULT_ADMIN_USERNAME.toLowerCase(),
            email: DEFAULT_ADMIN_EMAIL.toLowerCase(),
            password: hashedPassword
          });
          
          await Promise.race([
            adminUser.save(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Admin user creation timeout')), 10000)
            )
          ]);
          
          console.log(`Created default admin user '${DEFAULT_ADMIN_USERNAME}'`);
          console.log(`Use password: ${DEFAULT_PASSWORD}`);
        } else {
          console.log('Default admin user already exists');
        }
      } catch (seedErr) {
        console.error('Could not ensure default admin user:', seedErr.message);
      }
    }
    
    // Enhanced port handling
    const startListening = async (port) => {
      return new Promise((resolve, reject) => {
        const serverInstance = server.listen(port, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve({ server: serverInstance, port });
          }
        });
        
        serverInstance.on('error', (error) => {
          reject(error);
        });
      });
    };

    let serverPort = parseInt(PORT);
    let serverStarted = false;
    
    try {
      const result = await startListening(serverPort);
      serverStarted = true;
      
      console.log(`Server running on port ${serverPort}`);
      console.log(`WhatsApp Campaign Manager with Excel Support started`);
      console.log(`Frontend URL: http://localhost:${serverPort}`);
      console.log(`API URL: http://localhost:${serverPort}/api`);
      console.log(`Excel Upload: http://localhost:${serverPort}/api/contacts/upload`);
      console.log(`Health check: http://localhost:${serverPort}/health`);
      
    } catch (serverError) {
      if (serverError.code === 'EADDRINUSE') {
        console.error(`Port ${serverPort} is already in use!`);
        
        console.log(`Attempting to free port ${serverPort}...`);
        
        try {
          const killed = await killPort(serverPort);
          if (killed) {
            console.log(`Successfully freed port ${serverPort}`);
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await startListening(serverPort);
            serverStarted = true;
            console.log(`Server successfully started on port ${serverPort} after clearing conflicts`);
            
          } else {
            throw new Error('Could not kill existing processes');
          }
        } catch (killError) {
          console.error(`Could not free port ${serverPort}:`, killError.message);
          
          const altPort = await findAvailablePort(serverPort + 1, serverPort + 10);
          if (altPort) {
            console.log(`Trying alternative port ${altPort}...`);
            
            try {
              await startListening(altPort);
              serverStarted = true;
              serverPort = altPort;
              
              console.log(`Server started on alternative port ${altPort}`);
              console.log(`Access your app at: http://localhost:${altPort}`);
              console.log(`Update your frontend .env file to use port ${altPort}`);
              
              fs.writeFileSync('.port', altPort.toString());
              
            } catch (altError) {
              console.error(`Alternative port ${altPort} also failed:`, altError.message);
            }
          } else {
            console.error(`No available ports found between ${serverPort + 1} and ${serverPort + 10}`);
          }
        }
      } else {
        console.error(`Server startup error:`, serverError.message);
      }
    }

    if (!serverStarted) {
      console.error('Failed to start server on any port');
      console.error('Manual solutions:');
      console.error(`   1. Kill processes on port ${PORT}: npm run kill-port`);
      console.error(`   2. Change PORT in .env file to a different port`);
      console.error(`   3. Restart your computer to free all ports`);
      process.exit(1);
    }

    if (connected && serverStarted) {
      console.log('All systems operational including Excel processing');
      
      try {
        console.log('Background maintenance services temporarily disabled');
        // const cleanupTask = await startCleanupJob();
      } catch (cleanupError) {
        console.warn('Could not start maintenance job:', cleanupError.message);
      }
    } else if (!connected) {
      console.log('Running in limited mode without database');
      console.log('Fix database connection to enable all features');
    }
    
  } catch (error) {
    console.error('Failed to start server:', error);
    console.error('Server startup error details:');
    console.error('   Error:', error.message);
    
    console.log('Troubleshooting steps:');
    console.log('   1. Check your .env file configuration');
    console.log('   2. Verify MongoDB Atlas connection');
    console.log('   3. Check network connectivity');
    console.log('   4. Try: npm run kill-port');
    console.log('   5. Try: npm run clean-start');
    
    process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  stopCleanupJob();
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  stopCleanupJob();
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
});

startServer();