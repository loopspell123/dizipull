import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';

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
import CampaignLog from './models/CampaignLog.js'; // Import CampaignLog model
// Add WhatsApp Web.js imports for QR generation
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';

// Determine server directory and load environment variables from server/.env haiving fallback to parent directory  
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
    console.log(`📄 Loading environment from: ${envPath}`);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.log('⚠️  No .env file found, using system environment variables');
}

// Debug environment variables
console.log('🔧 Environment check:');
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
        "https://digihub-backend-axps.onrender.com", // Backend URL
        "https://digihub-fortend.onrender.com", // Frontend URL
        "http://localhost:3000",
        "http://localhost:5173",
      ];

      // Allow no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // Check allowed origins
      if (allowedOrigins.includes(origin) || 
          origin.includes('localhost') || 
          origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      
      console.log('❌ Socket.IO CORS blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  // Add connection timeout and other settings
  connectTimeout: 45000,
  pingTimeout: 30000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowEIO3: true, // Allow Engine.IO v3 clients
});

// Initialize session manager and message queue
const sessionManager = new SessionManager(io);
const messageQueue = new MessageQueue(io, sessionManager);

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

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Socket.IO connection handling
io.use(authenticateSocket);

io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.user.username} (ID: ${socket.userId})`);
  
  socket.join(`user_${socket.userId}`);
  // Store user socket for direct communication
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
          console.log(`🔄 Auto-restoring session: ${sessionData.sessionId}`);
          try {
            await sessionManager.restoreSession(sessionData.sessionId, socket.userId, socket);
          } catch (error) {
            console.error(`❌ Auto-restore failed for ${sessionData.sessionId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('❌ Auto-restore error:', error);
    }
  }, 2000);

  // Handle session creation with persistence option
  socket.on('create-session', async (data) => {
    const sessionId = data.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const persistent = data.persistent !== false; // Default to true
    
    try {
      console.log(`🆕 Create session request: ${sessionId} (persistent: ${persistent})`);
      
      if (typeof sessionManager.createSession === 'function') {
        await sessionManager.createSession(sessionId, socket.userId, socket, { persistent });
      } else {
        throw new Error('SessionManager createSession method not available');
      }
    } catch (error) {
      console.error(`❌ Create session error:`, error);
      socket.emit('session-error', { sessionId, error: error.message });
    }
  });

  // Add message history request handler
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

  // Update refresh-groups handler
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

  // Add logout-session handler with better cleanup
  socket.on('logout-session', async (data) => {
    try {
      const { sessionId } = data;
      const session = sessionManager.getSession(sessionId);
      
      if (!session || session.data.userId !== socket.userId) {
        socket.emit('logout-error', { sessionId, error: 'Session not found' });
        return;
      }

      console.log(`🚪 Logout requested for session: ${sessionId}`);
      
      // Graceful cleanup without file deletion
      await sessionManager.gracefulLogout(sessionId, 'user_logout');
      
      socket.emit('logout-success', { sessionId });

    } catch (error) {
      console.error(`❌ Logout error for ${data.sessionId}:`, error);
      socket.emit('logout-error', { 
        sessionId: data.sessionId, 
        error: error.message 
      });
    }
  });

  // Update disconnect handler
  socket.on('disconnect', () => {
    console.log(`📱 Client disconnected: ${socket.user?.username || socket.userId}`);
    if (sessionManager.userSockets) {
      sessionManager.userSockets.delete(socket.userId);
    }
    // Note: Don't cleanup sessions on disconnect for 24/7 operation
  });

  // Add manual session cleanup with safer file handling
  socket.on('cleanup-session', async (data) => {
    try {
      const { sessionId, force = false } = data;
      const session = sessionManager.getSession(sessionId);
      
      if (!session || session.data.userId !== socket.userId) {
        socket.emit('cleanup-error', { sessionId, error: 'Session not found' });
        return;
      }

      console.log(`🧹 Manual cleanup requested for session: ${sessionId} (force: ${force})`);

      if (force) {
        // Force cleanup - disconnect but preserve session files
        await sessionManager.forceDisconnect(sessionId, 'manual_force_cleanup');
      } else {
        // Graceful cleanup
        await sessionManager.gracefulLogout(sessionId, 'manual_cleanup');
      }
      
      // Update database but don't delete session record (for restoration)
      await Session.findOneAndUpdate(
        { sessionId, userId: socket.userId },
        { 
          status: 'disconnected', 
          updatedAt: new Date(),
          // Keep persistent flag for potential restoration
        }
      );
      
      socket.emit('cleanup-success', { sessionId });

    } catch (error) {
      console.error(`❌ Cleanup error for ${data.sessionId}:`, error);
      socket.emit('cleanup-error', { 
        sessionId: data.sessionId, 
        error: error.message 
      });
    }
  });

  // Add missing socket handlers from single file
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

  // Add send-message handler
  socket.on('send-message', async (data) => {
    try {
      console.log(`📨 Send message request:`, data);
      
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

      // Get group name for better logging
      const group = session.data.groups?.find(g => g.id === groupId);
      const groupName = group?.name || 'Unknown Group';

      console.log(`📤 Queuing message to group: ${groupName} (${groupId})`);

      const taskId = await messageQueue.addMessage(sessionId, groupId, message, mediaId);
      
      // Emit success response with all necessary data
      socket.emit('message-queued', { 
        taskId, 
        sessionId, 
        groupId,
        groupName,
        message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        timestamp: new Date(),
        status: 'queued'
      });

      console.log(`✅ Message queued successfully: ${taskId} for group ${groupName}`);

    } catch (error) {
      console.error(`❌ Send message error:`, error);
      socket.emit('message-error', { 
        sessionId: data?.sessionId,
        groupId: data?.groupId,
        error: error.message,
        timestamp: new Date()
      });
    }
  });

  // Add bulk message handler with better error handling
  socket.on('send-bulk-messages', async (data) => {
    try {
      console.log(`📨 Bulk message request:`, {
        sessionId: data.sessionId,
        groupCount: data.groupIds?.length || 0,
        messageLength: data.message?.length || 0
      });

      const { sessionId, groupIds, message, mediaId, delay = 10000 } = data;
      const session = sessionManager.getSession(sessionId);
      
      if (!session || session.data.userId !== socket.userId) {
        socket.emit('bulk-message-error', { 
          error: 'Session not found',
          sessionId 
        });
        return;
      }

      if (session.data.status !== 'connected') {
        socket.emit('bulk-message-error', { 
          error: `Session not connected. Status: ${session.data.status}`,
          sessionId 
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

      // Create campaign ID and tracker
      const campaignId = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`📤 Starting bulk campaign: ${campaignId} with ${groupIds.length} groups`);
      
      // Log campaign to database
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

      // Queue messages with staggered delays
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < groupIds.length; i++) {
        const groupId = groupIds[i];
        const group = session.data.groups?.find(g => g.id === groupId);
        
        setTimeout(async () => {
          try {
            await messageQueue.addMessage(
              sessionId, 
              groupId, 
              message, 
              mediaId,
              campaignId
            );
            successCount++;
            console.log(`✅ Queued ${successCount}/${groupIds.length}: ${group?.name || groupId}`);
          } catch (error) {
            errorCount++;
            console.error(`❌ Failed to queue ${errorCount}/${groupIds.length}: ${group?.name || groupId}:`, error);
          }

          // Send progress update
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
      console.error('❌ Bulk message error:', error);
      socket.emit('bulk-message-error', { 
        sessionId: data?.sessionId, 
        error: error.message,
        timestamp: new Date()
      });
    }
  });
});

// Add message history and dashboard routes
app.use('/api/messages', authenticateToken, (req, res, next) => {
  req.sessionManager = sessionManager;
  req.messageQueue = messageQueue;
  next();
});

// Message History API endpoint
app.get('/api/messages/history', authenticateToken, async (req, res) => {
  try {
    const { sessionId, page = 1, limit = 50, groupId } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { userId: req.user._id };
    if (sessionId) query.sessionId = sessionId;
    if (groupId) query.groupId = groupId;

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
    
    // Get message stats from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const messageStats = await MessageLog.aggregate([
      { $match: { userId: userId, sentAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { status: '$status' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalMessages = await MessageLog.countDocuments({ userId });
    const recentMessages = await MessageLog.find({ userId })
      .sort({ sentAt: -1 })
      .limit(10)
      .lean();

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
        }
      },
      recentMessages,
      sessions: userSessions
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Session persistence - restore sessions on server start
app.post('/api/sessions/restore', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find persistent sessions from database
    const persistentSessions = await Session.find({ 
      userId, 
      status: { $in: ['connected', 'authenticated'] },
      persistent: true 
    });

    console.log(`🔄 Restoring ${persistentSessions.length} persistent sessions for user ${userId}`);

    for (const sessionData of persistentSessions) {
      try {
        if (!sessionManager.getSession(sessionData.sessionId)) {
          // Restore session in background
          setTimeout(async () => {
            try {
              await sessionManager.restoreSession(sessionData.sessionId, userId);
            } catch (error) {
              console.error(`❌ Failed to restore session ${sessionData.sessionId}:`, error);
            }
          }, Math.random() * 5000); // Stagger restoration
        }
      } catch (error) {
        console.error(`❌ Error restoring session ${sessionData.sessionId}:`, error);
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

// Add file upload endpoint
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/files/${req.file.filename}`;

    // You need Upload model in your modular structure
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

// Campaign History API endpoint
app.get('/api/campaigns/history', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;
    
    const query = { userId: req.user._id };
    if (status) query.status = status;

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

// Delete old campaigns (7 days+)
app.delete('/api/campaigns/cleanup', authenticateToken, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const result = await CampaignLog.deleteMany({
      startedAt: { $lt: sevenDaysAgo }
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} campaigns older than 7 days`
    });
  } catch (error) {
    console.error('Campaign cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup old campaigns' });
  }
});

// Start server
const PORT = process.env.PORT || 3001;

import { startCleanupJob } from './utils/cronJobs.js';
import { killPort, findAvailablePort } from './utils/portCheck.js';

async function startServer() {
  try {
    console.log('🔌 Attempting to connect to MongoDB...');
    console.log('📍 MongoDB URI:', process.env.MONGODB_URI ? 'Set ✓' : 'Not set ✗');
    
    // Try to connect to database with extended retry logic
    let retries = 5;
    let connected = false;
    
    while (retries > 0 && !connected) {
      try {
        console.log(`🔄 Connection attempt ${6 - retries}/5...`);
        
        await Promise.race([
          connectDatabase(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database connection timeout after 45 seconds')), 45000)
          )
        ]);
        
        connected = true;
        console.log('✅ MongoDB connected successfully');
        
        try {
          console.log('🧪 Testing database operations...');
          const adminCount = await User.countDocuments();
          console.log(`👥 Found ${adminCount} users in database`);
        } catch (testError) {
          console.warn('⚠️  Database connection successful but operations failed:', testError.message);
        }
        
      } catch (dbError) {
        retries--;
        console.error(`❌ MongoDB connection attempt failed (${6 - retries}/5):`, dbError.message);
        
        if (retries > 0) {
          const delay = Math.min(3000 * (6 - retries), 15000);
          console.log(`🔄 Retrying in ${delay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error('💔 All MongoDB connection attempts failed');
          console.log('⚠️  Starting server without database connection...');
        }
      }
    }

    // Create admin user if database is connected
    if (connected) {
      try {
        const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
        const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
        const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'admin123';

        console.log('👤 Checking for admin user...');
        
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
          console.log('👤 Creating default admin user...');
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
          
          console.log(`✅ Created default admin user '${DEFAULT_ADMIN_USERNAME}'`);
          console.log(`🔑 Use password: ${DEFAULT_PASSWORD}`);
        } else {
          console.log('ℹ️  Default admin user already exists');
        }
      } catch (seedErr) {
        console.error('⚠️  Could not ensure default admin user:', seedErr.message);
      }
    }
    
    // Enhanced port handling with automatic conflict resolution
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
    
    // Try to start on configured port
    try {
      const result = await startListening(serverPort);
      serverStarted = true;
      
      console.log(`🚀 Server running on port ${serverPort}`);
      console.log(`📱 WhatsApp Campaign Manager started`);
      console.log(`🌐 Frontend URL: http://localhost:${serverPort}`);
      console.log(`🔗 API URL: http://localhost:${serverPort}/api`);
      console.log(`🏥 Health check: http://localhost:${serverPort}/health`);
      
    } catch (serverError) {
      if (serverError.code === 'EADDRINUSE') {
        console.error(`❌ Port ${serverPort} is already in use!`);
        
        // Try to automatically kill the process using the port
        console.log(`🔄 Attempting to free port ${serverPort}...`);
        
        try {
          const killed = await killPort(serverPort);
          if (killed) {
            console.log(`✅ Successfully freed port ${serverPort}`);
            
            // Wait a moment for the port to be fully released
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Try to start the server again
            await startListening(serverPort);
            serverStarted = true;
            console.log(`🚀 Server successfully started on port ${serverPort} after clearing conflicts`);
            
          } else {
            throw new Error('Could not kill existing processes');
          }
        } catch (killError) {
          console.error(`❌ Could not free port ${serverPort}:`, killError.message);
          
          // Find alternative port
          const altPort = await findAvailablePort(serverPort + 1, serverPort + 10);
          if (altPort) {
            console.log(`🔄 Trying alternative port ${altPort}...`);
            
            try {
              await startListening(altPort);
              serverStarted = true;
              serverPort = altPort;
              
              console.log(`✅ Server started on alternative port ${altPort}`);
              console.log(`🌐 Access your app at: http://localhost:${altPort}`);
              console.log(`⚠️  Update your frontend .env file to use port ${altPort}`);
              
              // Write the new port to a file that frontend can read
              const fs = await import('fs');
              fs.writeFileSync('.port', altPort.toString());
              
            } catch (altError) {
              console.error(`❌ Alternative port ${altPort} also failed:`, altError.message);
            }
          } else {
            console.error(`❌ No available ports found between ${serverPort + 1} and ${serverPort + 10}`);
          }
        }
      } else {
        console.error(`❌ Server startup error:`, serverError.message);
      }
    }

    if (!serverStarted) {
      console.error('❌ Failed to start server on any port');
      console.error('🔧 Manual solutions:');
      console.error(`   1. Kill processes on port ${PORT}: npm run kill-port`);
      console.error(`   2. Change PORT in .env file to a different port`);
      console.error(`   3. Restart your computer to free all ports`);
      process.exit(1);
    }

    // Start additional services only if server started successfully
    if (connected && serverStarted) {
      console.log('✅ All systems operational');
      
      try {
        startCleanupJob();
      } catch (cleanupError) {
        console.warn('⚠️  Could not start cleanup job:', cleanupError.message);
      }
    } else if (!connected) {
      console.log('⚠️  Running in limited mode without database');
      console.log('🔧 Fix database connection to enable all features');
    }
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('🔧 Server startup error details:');
    console.error('   Error:', error.message);
    
    console.log('🛠️  Troubleshooting steps:');
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
  console.log('📴 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

startServer();