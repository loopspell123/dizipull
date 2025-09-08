import Session from '../models/Session.js';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { safeDate } from '../utils/dateHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SessionManager {
  constructor(io) {
    this.io = io;
    this.activeSessions = new Map();
    this.userSockets = new Map();
    this.qrTimeouts = new Map();
    this.reconnectTimers = new Map();
  }

  // Add graceful logout method (doesn't delete files)
  async gracefulLogout(sessionId, reason = 'logout') {
    console.log(`🚪 Graceful logout for ${sessionId} (${reason})`);
    
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        console.log(`⚠️ Session ${sessionId} not found for logout`);
        return;
      }

      // Update session status
      session.data.status = 'logging_out';

      // Clear timeouts
      if (this.qrTimeouts.has(sessionId)) {
        clearTimeout(this.qrTimeouts.get(sessionId));
        this.qrTimeouts.delete(sessionId);
      }

      if (this.reconnectTimers.has(sessionId)) {
        clearTimeout(this.reconnectTimers.get(sessionId));
        this.reconnectTimers.delete(sessionId);
      }

      // Gracefully disconnect client without destroying auth data
      if (session.client) {
        try {
          // Just disconnect, don't logout (preserves session files)
          await Promise.race([
            session.client.pupPage?.close(),
            new Promise(resolve => setTimeout(resolve, 3000))
          ]);
          console.log(`✅ Client disconnected gracefully for ${sessionId}`);
        } catch (error) {
          console.warn(`⚠️ Warning during graceful disconnect of ${sessionId}:`, error.message);
        }
      }

      // Update session status but keep it in memory for quick reconnect
      session.data.status = 'disconnected';
      session.data.lastActivity = new Date();

      // Update database
      if (Session) {
        await Session.findOneAndUpdate(
          { sessionId, userId: session.data.userId },
          { 
            status: 'disconnected', 
            lastActivity: new Date(),
            updatedAt: new Date()
          }
        ).catch(console.error);
      }

      // Emit to user
      this.io.to(`user_${session.data.userId}`).emit('session-logged-out', {
        sessionId,
        reason,
        canReconnect: true
      });

      console.log(`✅ Graceful logout completed for ${sessionId}`);

    } catch (error) {
      console.error(`❌ Graceful logout error for ${sessionId}:`, error);
      throw error;
    }
  }

  // Add force disconnect method
  async forceDisconnect(sessionId, reason = 'force_disconnect') {
    console.log(`⚡ Force disconnect for ${sessionId} (${reason})`);
    
    try {
      const session = this.getSession(sessionId);
      if (!session) {
        console.log(`⚠️ Session ${sessionId} not found for force disconnect`);
        return;
      }

      // Clear all timeouts immediately
      if (this.qrTimeouts.has(sessionId)) {
        clearTimeout(this.qrTimeouts.get(sessionId));
        this.qrTimeouts.delete(sessionId);
      }

      if (this.reconnectTimers.has(sessionId)) {
        clearTimeout(this.reconnectTimers.get(sessionId));
        this.reconnectTimers.delete(sessionId);
      }

      // Force close client
      if (session.client) {
        try {
          // Force close browser pages
          if (session.client.pupPage) {
            await session.client.pupPage.close().catch(() => {});
          }
          if (session.client.pupBrowser) {
            await session.client.pupBrowser.close().catch(() => {});
          }
        } catch (error) {
          console.warn(`⚠️ Warning during force disconnect of ${sessionId}:`, error.message);
        }
      }

      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      // Update database
      if (Session) {
        await Session.findOneAndUpdate(
          { sessionId, userId: session.data.userId },
          { 
            status: 'force_disconnected', 
            lastActivity: new Date(),
            updatedAt: new Date()
          }
        ).catch(console.error);
      }

      // Emit to user
      this.io.to(`user_${session.data.userId}`).emit('session-force-disconnected', {
        sessionId,
        reason
      });

      console.log(`✅ Force disconnect completed for ${sessionId}`);

    } catch (error) {
      console.error(`❌ Force disconnect error for ${sessionId}:`, error);
      throw error;
    }
  }

  // Main method called from index.js
  async createSession(sessionId, userId, socket, options = {}) {
    const { persistent = true } = options;
    
    try {
      console.log(`🚀 Creating WhatsApp session: ${sessionId} for user: ${userId} (persistent: ${persistent})`);

      // Check if session already exists
      if (this.activeSessions.has(sessionId)) {
        console.log(`⚠️ Session ${sessionId} already active, using existing session`);
        const existingSession = this.activeSessions.get(sessionId);
        
        // Update socket reference
        if (socket) {
          this.userSockets.set(userId, socket);
        }
        
        // Emit current status
        socket?.emit('session-status', {
          sessionId,
          status: existingSession.data.status,
          phoneNumber: existingSession.data.phoneNumber
        });
        
        return existingSession;
      }

      // Ensure sessions directory exists
      const sessionsDir = path.join(process.cwd(), 'sessions');
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
      }

      // Save session to database immediately
      if (Session) {
        await Session.findOneAndUpdate(
          { sessionId, userId },
          { 
            sessionId, 
            userId, 
            status: 'initializing',
            persistent,
            lastActivity: new Date(),
            updatedAt: new Date()
          },
          { upsert: true, new: true }
        );
      }

      // Create WhatsApp Web.js client with better error handling
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: './sessions'
        }),
        puppeteer: {
          headless: 'new',
          timeout: 60000,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--no-first-run',
            '--disable-default-apps'
          ]
        }
      });

      const sessionData = {
        id: sessionId,
        userId: userId,
        status: 'initializing',
        phoneNumber: null,
        groups: [],
        messagesSent: 0,
        lastActivity: new Date(),
        clientInfo: null,
        persistent
      };

      const session = {
        client: client,
        data: sessionData
      };

      this.activeSessions.set(sessionId, session);
      this.setupEventHandlers(sessionId, client, socket, userId);
      
      console.log(`📱 Initializing WhatsApp client for ${sessionId}`);
      
      // Initialize with timeout
      await Promise.race([
        client.initialize(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Client initialization timeout')), 120000)
        )
      ]);

      return session;

    } catch (error) {
      console.error(`❌ Error creating session ${sessionId}:`, error);
      
      // Cleanup on error
      this.activeSessions.delete(sessionId);
      
      // Update database status
      if (Session) {
        await Session.findOneAndUpdate(
          { sessionId, userId },
          { status: 'error', updatedAt: new Date() }
        ).catch(console.error);
      }
      
      throw error;
    }
  }

  // Add session restoration method
  async restoreSession(sessionId, userId, socket = null) {
    try {
      console.log(`🔄 Restoring session: ${sessionId}`);

      // Check if session exists in database
      const sessionDoc = await Session.findOne({ sessionId, userId });
      if (!sessionDoc) {
        throw new Error('Session not found in database');
      }

      // Check if already active
      if (this.activeSessions.has(sessionId)) {
        console.log(`✅ Session ${sessionId} already active`);
        return this.activeSessions.get(sessionId);
      }

      // Create WhatsApp client with existing auth
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: './sessions'
        }),
        puppeteer: {
          headless: 'new',
          timeout: 0,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions'
          ]
        }
      });

      const sessionData = {
        id: sessionId,
        userId: userId,
        status: 'connecting',
        phoneNumber: sessionDoc.phoneNumber,
        groups: sessionDoc.groups || [],
        messagesSent: sessionDoc.messagesSent || 0,
        lastActivity: new Date(),
        clientInfo: sessionDoc.clientInfo,
        persistent: sessionDoc.persistent
      };

      const session = {
        client: client,
        data: sessionData
      };

      this.activeSessions.set(sessionId, session);
      this.setupEventHandlers(sessionId, client, socket, userId);

      // Initialize without QR (should use existing auth)
      await client.initialize();

      return session;

    } catch (error) {
      console.error(`❌ Error restoring session ${sessionId}:`, error);
      // Update database status
      await Session.findOneAndUpdate(
        { sessionId, userId },
        { status: 'error', updatedAt: new Date() }
      ).catch(console.error);
      
      throw error;
    }
  }

  // Setup WhatsApp Web.js event handlers - This is the key part for QR generation
  setupEventHandlers(sessionId, client, socket, userId) {
    
    // QR Code generation - This was missing!
    client.on('qr', async (qr) => {
      console.log(`📱 QR Code generated for ${sessionId}`);
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(qr, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' }
        });

        const session = this.getSession(sessionId);
        if (session) {
          session.data.status = 'waiting_scan';
          session.data.qrCode = qrCodeDataUrl;

          // Emit QR code to client
          const qrData = {
            sessionId,
            qrCode: qrCodeDataUrl,
            status: 'waiting_scan',
            timestamp: Date.now()
          };

          console.log(`📡 Emitting QR code for session ${sessionId}`);
          this.io.to(`user_${userId}`).emit('qr-code', qrData);
          
          if (socket && socket.connected) {
            socket.emit('qr-code', qrData);
          }

          // Set QR timeout
          if (this.qrTimeouts.has(sessionId)) {
            clearTimeout(this.qrTimeouts.get(sessionId));
          }
          
          this.qrTimeouts.set(sessionId, setTimeout(() => {
            console.log(`⏰ QR expired for ${sessionId}`);
            this.io.to(`user_${userId}`).emit('qr-expired', { sessionId });
          }, 45000)); // 45 second timeout
        }

      } catch (error) {
        console.error(`❌ QR generation error for ${sessionId}:`, error);
      }
    });

    client.on('authenticated', async () => {
      console.log(`✅ ${sessionId} authenticated`);
      const session = this.getSession(sessionId);
      if (session) {
        session.data.status = 'authenticated';
        
        // Update database
        await Session.findOneAndUpdate(
          { sessionId, userId },
          { status: 'authenticated', updatedAt: new Date() }
        ).catch(console.error);
        
        this.io.to(`user_${userId}`).emit('session-authenticated', { sessionId });
      }
    });

    client.on('ready', async () => {
      console.log(`🚀 ${sessionId} ready and connected`);
      
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.data.status = 'connected';
        session.data.phoneNumber = client.info?.wid?.user || 'Unknown';
        session.data.clientInfo = {
          platform: client.info?.platform || 'unknown',
          pushName: client.info?.pushname || 'Unknown',
          battery: client.info?.battery || 0
        };
        session.data.lastActivity = new Date();

        // Update database
        await Session.findOneAndUpdate(
          { sessionId, userId },
          { 
            status: 'connected',
            phoneNumber: session.data.phoneNumber,
            clientInfo: session.data.clientInfo,
            lastActivity: new Date(),
            updatedAt: new Date()
          }
        ).catch(console.error);

        // Clear QR timeout
        if (this.qrTimeouts.has(sessionId)) {
          clearTimeout(this.qrTimeouts.get(sessionId));
          this.qrTimeouts.delete(sessionId);
        }

        // Emit session ready
        this.io.to(`user_${userId}`).emit('session-ready', {
          sessionId,
          status: 'connected',
          phoneNumber: session.data.phoneNumber,
          clientInfo: session.data.clientInfo,
          restored: true
        });

        // Fetch groups after a delay
        setTimeout(async () => {
          try {
            await this.fetchAndSaveGroups(sessionId, client);
          } catch (error) {
            console.error(`❌ Error fetching groups for ${sessionId}:`, error);
          }
        }, 5000);
      }
    });

    client.on('disconnected', async (reason) => {
      console.log(`🔌 Session ${sessionId} disconnected: ${reason}`);
      const session = this.getSession(sessionId);
      if (session) {
        session.data.status = 'disconnected';
        
        // Update database but keep persistent flag
        await Session.findOneAndUpdate(
          { sessionId, userId },
          { status: 'disconnected', updatedAt: new Date() }
        ).catch(console.error);
        
        this.io.to(`user_${userId}`).emit('session-disconnected', { sessionId, reason });

        // Auto-reconnect persistent sessions
        if (session.data.persistent) {
          console.log(`🔄 Scheduling reconnect for persistent session ${sessionId}`);
          setTimeout(async () => {
            try {
              await this.restoreSession(sessionId, userId);
            } catch (error) {
              console.error(`❌ Auto-reconnect failed for ${sessionId}:`, error);
            }
          }, 30000); // Reconnect after 30 seconds
        }
      }
    });

    client.on('auth_failure', (msg) => {
      console.log(`❌ Auth failed for ${sessionId}: ${msg}`);
      const session = this.getSession(sessionId);
      if (session) {
        session.data.status = 'error';
        this.io.to(`user_${userId}`).emit('session-error', { 
          sessionId, 
          error: `Authentication failed: ${msg}` 
        });
      }
    });
  }

  // Get session
  getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  // Get user sessions
  getUserSessions(userId) {
    return Array.from(this.activeSessions.values())
      .filter(session => session.data.userId === userId)
      .map(session => ({
        id: session.data.id,
        status: session.data.status,
        phoneNumber: session.data.phoneNumber,
        groupCount: session.data.groups?.length || 0,
        messagesSent: session.data.messagesSent || 0,
        lastActivity: session.data.lastActivity
      }));
  }

  // Enhanced fetchAndSaveGroups with safe date handling
  async fetchAndSaveGroups(sessionId, client) {
    try {
      console.log(`🔍 Fetching groups for ${sessionId}`);
      
      const chats = await client.getChats();
      const groups = chats
        .filter(chat => chat.isGroup && chat.name)
        .map(group => ({
          id: group.id._serialized,
          name: group.name,
          participantCount: group.participants?.length || 0,
          lastActivity: safeDate(group.timestamp), // Use safe date helper
          unreadCount: group.unreadCount || 0,
          description: group.description || '',
          isSelected: false
        }))
        .sort((a, b) => b.lastActivity - a.lastActivity);

      console.log(`📚 Found ${groups.length} groups for ${sessionId}`);

      // Update session in memory
      const session = this.getSession(sessionId);
      if (session) {
        session.data.groups = groups;
        
        // Save groups to database with better error handling
        try {
          await Session.findOneAndUpdate(
            { sessionId, userId: session.data.userId },
            { 
              groups,
              updatedAt: new Date()
            },
            { 
              upsert: false,
              runValidators: true,
              new: true
            }
          );
          console.log(`💾 Successfully saved ${groups.length} groups to database for ${sessionId}`);
        } catch (dbError) {
          console.error(`❌ Database save error for ${sessionId}:`, dbError.message);
          // Groups are still available in memory even if DB save fails
        }
        
        // Emit groups to user
        this.io.to(`user_${session.data.userId}`).emit('groups-loaded', {
          sessionId,
          groups,
          phoneNumber: session.data.phoneNumber,
          timestamp: new Date()
        });
      }

      return groups;

    } catch (error) {
      console.error(`❌ Error fetching groups for ${sessionId}:`, error);
      throw error;
    }
  }

  // Cleanup session
  async cleanupSession(sessionId, reason = 'manual') {
    console.log(`🧹 Cleaning up ${sessionId} (${reason})`);
    
    try {
      // Clear timeouts first
      if (this.qrTimeouts.has(sessionId)) {
        clearTimeout(this.qrTimeouts.get(sessionId));
        this.qrTimeouts.delete(sessionId);
      }

      if (this.reconnectTimers.has(sessionId)) {
        clearTimeout(this.reconnectTimers.get(sessionId));
        this.reconnectTimers.delete(sessionId);
      }

      const session = this.getSession(sessionId);
      if (session && session.client) {
        try {
          // Don't call logout() to avoid file deletion issues
          // Just destroy the client connection
          await Promise.race([
            session.client.destroy(),
            new Promise(resolve => setTimeout(resolve, 5000))
          ]);
        } catch (error) {
          console.warn(`Warning during cleanup of ${sessionId}:`, error.message);
        }
      }

      this.activeSessions.delete(sessionId);
      
    } catch (error) {
      console.error(`❌ Cleanup error for ${sessionId}:`, error);
      // Force remove from active sessions even on error
      this.activeSessions.delete(sessionId);
    }
  }
}

export default SessionManager;