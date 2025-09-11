import Session from '../models/Session.js';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { performNetworkCheck } from '../utils/networkCheck.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SessionManager {
  constructor(io) {
    this.io = io;
    this.sessions = new Map(); // Single session storage
    this.userSockets = new Map();
    this.timeouts = new Map(); // All timeouts in one place
  }

  // Main session creation method
  async createSession(sessionId, userId, socket, options = {}) {
    const { persistent = true } = options;
    
    try {
      console.log(`🚀 Creating WhatsApp session: ${sessionId} for user: ${userId}`);

      // Check basic internet connectivity (but don't fail on WhatsApp Web check)
      const networkStatus = await performNetworkCheck();
      if (!networkStatus.internet) {
        throw new Error(`No internet connectivity detected`);
      }
      
      if (!networkStatus.whatsapp) {
        console.log(`⚠️ WhatsApp Web accessibility check failed, but proceeding with session creation`);
      }

      // Check session limits
      const userSessions = this.getUserSessions(userId);
      if (userSessions.length >= 3) {
        throw new Error('Maximum 3 sessions per user allowed. Please delete an existing session first.');
      }

      // Clean up existing session with same ID
      if (this.sessions.has(sessionId)) {
        console.log(`⚠️ Destroying existing session: ${sessionId}`);
        await this.destroySession(sessionId);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Save session to database with error handling
      if (Session) {
        try {
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
            { upsert: true, new: true, timeout: 5000 }
          );
        } catch (dbError) {
          console.warn(`⚠️ Database save failed for ${sessionId}:`, dbError.message);
          // Continue without database - session will work in memory
        }
      }

      // Create WhatsApp client with improved stability and network handling
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: './sessions'
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--no-first-run',
            '--disable-default-apps',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--enable-features=NetworkService,NetworkServiceLogging',
            '--force-color-profile=srgb',
            '--metrics-recording-only',
            '--no-crash-upload',
            '--enable-automation',
            '--password-store=basic',
            '--use-mock-keychain',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-gpu',
            '--single-process',
            '--disable-background-networking',
            '--disable-sync'
          ],
          timeout: 60000,
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false
        }
      });

      // Create session data
      const sessionData = {
        client: client,
        data: {
          sessionId,
          userId,
          status: 'initializing',
          phoneNumber: null,
          groups: [],
          messagesSent: 0,
          lastActivity: new Date(),
          persistent,
          qrRetries: 0,
          authFailures: 0
        }
      };

      this.sessions.set(sessionId, sessionData);
      this.userSockets.set(userId, socket);

      // Set initialization timeout (increased to 3 minutes for better reliability)
      const initTimeout = setTimeout(() => {
        console.log(`⏰ Initialization timeout for ${sessionId}`);
        const session = this.sessions.get(sessionId);
        if (session && session.data.status !== 'waiting_scan' && session.data.status !== 'connected') {
          // Only timeout if still in initializing/retrying state
          session.data.status = 'timeout';
          this.emitToUser(userId, 'session-error', {
            sessionId,
            error: 'Session initialization timeout - please try again'
          });
          // Clean up the session
          setTimeout(() => this.destroySession(sessionId), 1000);
        }
      }, 180000); // 180 seconds (3 minutes)

      this.timeouts.set(`${sessionId}_init`, initTimeout);

      // Setup event handlers
      this.setupEventHandlers(sessionId, client, userId);
      
      // Initialize client with network check
      try {
        await this.initializeWithRetry(client, sessionId, userId);
      } catch (initError) {
        console.error(`❌ Failed to initialize ${sessionId} after retries:`, initError.message);
        // Update session status but don't immediately destroy - let timeout handle cleanup
        const session = this.sessions.get(sessionId);
        if (session) {
          session.data.status = 'init_failed';
          this.emitToUser(userId, 'session-error', {
            sessionId,
            error: `Initialization failed: ${initError.message}`
          });
        }
      }

      return sessionData;

    } catch (error) {
      console.error(`❌ Error creating session ${sessionId}:`, error);
      
      // Cleanup on error
      this.sessions.delete(sessionId);
      this.clearTimeouts(sessionId);
      
      throw error;
    }
  }

  // Setup WhatsApp event handlers
  setupEventHandlers(sessionId, client, userId) {
    
    // QR Code generation
    client.on('qr', async (qr) => {
      try {
        console.log(`📱 QR Code generated for ${sessionId}`);
        
        const qrCodeDataUrl = await QRCode.toDataURL(qr, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' }
        });

        const session = this.sessions.get(sessionId);
        if (session) {
          // Clear any existing QR timeout to prevent duplicates
          this.clearTimeout(`${sessionId}_qr`);
          
          session.data.status = 'waiting_scan';
          session.data.qrCode = qrCodeDataUrl;
          session.data.qrRetries++;
          session.data.lastActivity = new Date();

          // Clear init timeout when QR is generated (connection is working)
          this.clearTimeout(`${sessionId}_init`);

          console.log(`✅ QR code ready for ${sessionId} (attempt ${session.data.qrRetries})`);

          // Emit QR code
          this.emitToUser(userId, 'qr-code', {
            sessionId,
            qrCode: qrCodeDataUrl,
            status: 'waiting_scan', // Use consistent status
            retries: session.data.qrRetries
          });

          // Set QR timeout (5 minutes for better user experience)
          const qrTimeout = setTimeout(() => {
            console.log(`⏰ QR expired for ${sessionId}`);
            const currentSession = this.sessions.get(sessionId);
            if (currentSession && currentSession.data.status === 'waiting_scan') {
              currentSession.data.status = 'qr_expired';
              this.emitToUser(userId, 'qr-expired', { sessionId });
            }
          }, 300000); // 5 minutes

          this.timeouts.set(`${sessionId}_qr`, qrTimeout);
        }

      } catch (error) {
        console.error(`❌ QR generation error for ${sessionId}:`, error);
      }
    });

    // Authentication success
    client.on('authenticated', async () => {
      console.log(`✅ ${sessionId} authenticated`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.data.status = 'authenticated';
        session.data.lastActivity = new Date();
        
        this.clearTimeout(`${sessionId}_qr`);
        
        // Update database
        await this.updateSessionInDB(sessionId, { status: 'authenticated' });

        this.emitToUser(userId, 'session-authenticated', { sessionId });
        
        // Send updated sessions list to user
        this.sendUpdatedSessionsToUser(userId);
      }
    });

    // Client ready
    client.on('ready', async () => {
      console.log(`🚀 ${sessionId} ready and connected`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        try {
          session.data.status = 'connected';
          session.data.phoneNumber = client.info?.wid?.user || 'Unknown';
          session.data.lastActivity = new Date();

          // Update database
          await this.updateSessionInDB(sessionId, {
            status: 'connected',
            phoneNumber: session.data.phoneNumber
          });

          this.emitToUser(userId, 'session-ready', {
            sessionId,
            status: 'connected',
            phoneNumber: session.data.phoneNumber
          });

          // Send updated sessions list to user
          this.sendUpdatedSessionsToUser(userId);

          // Start health monitoring for connected session
          this.startHealthMonitoring(sessionId, userId);

          // Fetch groups after delay
          setTimeout(async () => {
            try {
              await this.fetchGroups(sessionId);
            } catch (error) {
              console.error(`❌ Error fetching groups for ${sessionId}:`, error);
            }
          }, 3000);

          // Start periodic health check for this session
          this.startHealthCheck(sessionId, userId);

        } catch (error) {
          console.error(`❌ Error in ready handler for ${sessionId}:`, error);
        }
      }
    });

    // Disconnection
    client.on('disconnected', async (reason) => {
      console.log(`🔌 ${sessionId} disconnected: ${reason}`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.data.status = 'disconnected';
        session.data.lastActivity = new Date();
        
        await this.updateSessionInDB(sessionId, { status: 'disconnected' });
        
        this.emitToUser(userId, 'session-disconnected', { sessionId, reason });
      }
    });

    // Error handling
    client.on('error', async (error) => {
      console.log(`❌ Client error for ${sessionId}:`, error.message);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        // Check for network connectivity errors
        if (error.message.includes('ERR_SOCKET_NOT_CONNECTED') || 
            error.message.includes('ERR_NETWORK_CHANGED') ||
            error.message.includes('ERR_INTERNET_DISCONNECTED')) {
          
          console.log(`🌐 Network connectivity issue detected for ${sessionId}`);
          session.data.status = 'network_error';
          
          this.emitToUser(userId, 'session-error', { 
            sessionId, 
            error: 'Network connectivity issue. Please check your internet connection and try again.' 
          });
          
          // Retry after network delay
          setTimeout(() => {
            console.log(`🔄 Retrying ${sessionId} after network error`);
            this.retrySession(sessionId, userId);
          }, 5000);
          
        } else {
          session.data.status = 'error';
          this.emitToUser(userId, 'session-error', { 
            sessionId, 
            error: `Client error: ${error.message}` 
          });
        }
      }
    });

    // Authentication failure
    client.on('auth_failure', async (msg) => {
      console.log(`❌ Auth failed for ${sessionId}: ${msg}`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.data.status = 'auth_failure';
        session.data.authFailures++;
        
        this.emitToUser(userId, 'session-error', { 
          sessionId, 
          error: `Authentication failed: ${msg}` 
        });

        // Remove session after 3 failures
        if (session.data.authFailures >= 3) {
          console.log(`💀 Removing ${sessionId} after 3 auth failures`);
          await this.destroySession(sessionId);
        }
      }
    });
  }

  // Fetch WhatsApp groups
  async fetchGroups(sessionId) {
    try {
      console.log(`🔍 Fetching groups for ${sessionId}`);
      
      const session = this.sessions.get(sessionId);
      if (!session || !session.client) {
        throw new Error('Session or client not found');
      }

      const chats = await session.client.getChats();
      const groups = chats
        .filter(chat => chat.isGroup && chat.name)
        .map(group => ({
          id: group.id._serialized,
          name: group.name,
          participantCount: group.participants?.length || 0,
          lastActivity: group.timestamp || Date.now(),
          unreadCount: group.unreadCount || 0,
          isSelected: false
        }))
        .sort((a, b) => b.lastActivity - a.lastActivity);

      console.log(`📚 Found ${groups.length} groups for ${sessionId}`);

      // Update session
      session.data.groups = groups;
      
      // Update database
      await this.updateSessionInDB(sessionId, { groups });
      
      // Emit to user
      this.emitToUser(session.data.userId, 'groups-loaded', {
        sessionId,
        groups,
        phoneNumber: session.data.phoneNumber
      });

      return groups;

    } catch (error) {
      console.error(`❌ Error fetching groups for ${sessionId}:`, error);
      throw error;
    }
  }

  // Logout session (keep session alive)
  async logoutSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    try {
      console.log(`👋 Logging out session: ${sessionId}`);
      
      // Just disconnect, don't destroy
      if (session.client && session.data.status === 'connected') {
        await session.client.logout();
      }

      // Update status to disconnected
      session.data.status = 'disconnected';
      session.data.groups = [];
      session.data.lastActivity = new Date();

      await this.updateSessionInDB(sessionId, { status: 'disconnected' });

      this.emitToUser(session.data.userId, 'session-logged-out', {
        sessionId,
        status: 'disconnected',
        message: 'Session logged out. You can reconnect by scanning QR code.'
      });

      return true;

    } catch (error) {
      console.error(`❌ Error logging out session ${sessionId}:`, error);
      throw error;
    }
  }

  // Destroy session completely
  async destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`⚠️ Session ${sessionId} not found for destruction`);
      return;
    }

    try {
      console.log(`🗑️ Destroying session: ${sessionId}`);

      // Clear all timeouts
      this.clearTimeouts(sessionId);

      // Destroy client
      if (session.client) {
        try {
          await Promise.race([
            session.client.destroy(),
            new Promise(resolve => setTimeout(resolve, 5000))
          ]);
        } catch (error) {
          console.warn(`Warning destroying client ${sessionId}:`, error.message);
        }
      }

      // Remove from memory
      this.sessions.delete(sessionId);

      // Update database
      await this.updateSessionInDB(sessionId, { status: 'destroyed' });

      // Emit removal event
      this.emitToUser(session.data.userId, 'session-destroyed', {
        sessionId,
        message: 'Session destroyed successfully'
      });

      console.log(`✅ Session ${sessionId} destroyed`);

    } catch (error) {
      console.error(`❌ Error destroying session ${sessionId}:`, error);
      // Force remove even on error
      this.sessions.delete(sessionId);
    }
  }

  // Disconnect session (soft disconnect)
  async disconnectSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`⚠️ Session ${sessionId} not found for disconnection`);
      return false;
    }

    try {
      console.log(`🔌 Disconnecting session: ${sessionId}`);

      // Clear timeouts but keep session data
      this.clearTimeouts(sessionId);

      // Disconnect client
      if (session.client) {
        try {
          await Promise.race([
            session.client.logout(),
            new Promise(resolve => setTimeout(resolve, 3000))
          ]);
        } catch (error) {
          console.warn(`Warning disconnecting client ${sessionId}:`, error.message);
        }
      }

      // Update status but keep in memory
      session.data.status = 'disconnected';
      session.data.lastActivity = new Date();

      // Update database
      await this.updateSessionInDB(sessionId, { 
        status: 'disconnected',
        lastActivity: new Date()
      });

      // Emit disconnection event
      this.emitToUser(session.data.userId, 'session-disconnected', {
        sessionId,
        message: 'Session disconnected successfully'
      });

      console.log(`✅ Session ${sessionId} disconnected`);
      return true;

    } catch (error) {
      console.error(`❌ Error disconnecting session ${sessionId}:`, error);
      return false;
    }
  }

  // Helper methods
  getUserSessions(userId) {
    const userSessions = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.data.userId === userId) {
        userSessions.push({
          id: sessionId, // Frontend compatibility
          sessionId, // Backend consistency
          ...session.data
        });
      }
    }
    return userSessions;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  clearTimeout(key) {
    if (this.timeouts.has(key)) {
      const timeout = this.timeouts.get(key);
      if (typeof timeout === 'number') {
        clearTimeout(timeout);
      } else {
        // Handle interval for health checks
        clearInterval(timeout);
      }
      this.timeouts.delete(key);
    }
  }

  clearTimeouts(sessionId) {
    const keys = [`${sessionId}_init`, `${sessionId}_qr`, `${sessionId}_reconnect`, `${sessionId}_health`];
    keys.forEach(key => this.clearTimeout(key));
  }

  emitToUser(userId, event, data) {
    this.io.to(`user_${userId}`).emit(event, data);
    
    // Also emit to user's socket if available
    const userSocket = this.userSockets.get(userId);
    if (userSocket && userSocket.connected) {
      userSocket.emit(event, data);
    }
  }

  async updateSessionInDB(sessionId, updates) {
    try {
      const session = this.sessions.get(sessionId);
      if (session && Session) {
        await Promise.race([
          Session.findOneAndUpdate(
            { sessionId, userId: session.data.userId },
            { ...updates, updatedAt: new Date() }
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database timeout')), 10000)
          )
        ]);
      }
    } catch (error) {
      console.warn(`⚠️ Database update failed for ${sessionId}:`, error.message);
      // Continue without database - session will work in memory
    }
  }

  // Session statistics
  getSessionStats() {
    const stats = {
      total: this.sessions.size,
      byStatus: {},
      activeConnections: 0
    };

    for (const [sessionId, session] of this.sessions) {
      const status = session.data.status;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      
      if (status === 'connected') {
        stats.activeConnections++;
      }
    }

    return stats;
  }

  // Initialize client with retry logic for network issues
  async initializeWithRetry(client, sessionId, userId, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      console.log(`🔄 Initializing ${sessionId} (attempt ${retryCount + 1}/${maxRetries + 1})`);
      await client.initialize();
    } catch (error) {
      console.error(`❌ Initialization failed for ${sessionId}:`, error.message);
      
      if (retryCount < maxRetries && 
          (error.message.includes('ERR_SOCKET_NOT_CONNECTED') || 
           error.message.includes('ERR_NETWORK_CHANGED') ||
           error.message.includes('ERR_INTERNET_DISCONNECTED'))) {
        
        console.log(`🔄 Retrying ${sessionId} in ${(retryCount + 1) * 2} seconds...`);
        
        const session = this.sessions.get(sessionId);
        if (session) {
          session.data.status = 'retrying';
          this.emitToUser(userId, 'session-status', { 
            sessionId, 
            status: 'retrying',
            message: `Network error. Retrying in ${(retryCount + 1) * 2} seconds...`
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
        return this.initializeWithRetry(client, sessionId, userId, retryCount + 1);
      } else {
        throw error;
      }
    }
  }

  // Retry a session after network error
  async retrySession(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    try {
      console.log(`🔄 Retrying session ${sessionId} after network error`);
      session.data.status = 'retrying';
      
      this.emitToUser(userId, 'session-status', { 
        sessionId, 
        status: 'retrying',
        message: 'Retrying connection...'
      });
      
      // Destroy and recreate the client
      if (session.client) {
        try {
          await session.client.destroy();
        } catch (err) {
          console.log(`⚠️ Error destroying client during retry: ${err.message}`);
        }
      }
      
      // Wait a moment before recreating
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Recreate session
      await this.createSession(sessionId, userId, this.userSockets.get(userId), {
        persistent: session.data.persistent
      });
      
    } catch (error) {
      console.error(`❌ Error retrying session ${sessionId}:`, error);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.data.status = 'error';
        this.emitToUser(userId, 'session-error', { 
          sessionId, 
          error: `Retry failed: ${error.message}` 
        });
      }
    }
  }

  // Cleanup method
  async performCleanup() {
    console.log('🧹 Performing session cleanup...');
    
    const now = Date.now();
    const sessionsToCleanup = [];

    for (const [sessionId, session] of this.sessions) {
      const lastActivity = session.data.lastActivity?.getTime() || now;
      const age = now - lastActivity;
      
      // Clean up sessions older than 24 hours and disconnected
      const isOldAndDisconnected = age > (24 * 60 * 60 * 1000) && 
                                   session.data.status !== 'connected';
      
      if (isOldAndDisconnected) {
        sessionsToCleanup.push(sessionId);
      }
    }

    for (const sessionId of sessionsToCleanup) {
      await this.destroySession(sessionId);
    }

    console.log(`🧹 Cleaned up ${sessionsToCleanup.length} sessions`);
  }

  // Periodic health check for connected sessions
  startHealthCheck(sessionId, userId) {
    const healthCheckInterval = setInterval(async () => {
      try {
        const session = this.sessions.get(sessionId);
        if (!session || session.data.status !== 'connected') {
          console.log(`🏥 Stopping health check for ${sessionId} - session not connected`);
          clearInterval(healthCheckInterval);
          return;
        }

        // Check if client is still responsive
        const client = session.client;
        const state = await Promise.race([
          client.getState(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          )
        ]);

        if (state !== 'CONNECTED') {
          console.log(`🚨 Health check failed for ${sessionId} - state: ${state}`);
          
          session.data.status = 'disconnected';
          await this.updateSessionInDB(sessionId, { status: 'disconnected' });
          
          this.emitToUser(userId, 'session-disconnected', { 
            sessionId, 
            reason: `Connection lost - state: ${state}` 
          });
          
          clearInterval(healthCheckInterval);
        } else {
          console.log(`💚 Health check passed for ${sessionId}`);
        }

      } catch (error) {
        console.error(`🚨 Health check error for ${sessionId}:`, error.message);
        
        const session = this.sessions.get(sessionId);
        if (session) {
          session.data.status = 'disconnected';
          await this.updateSessionInDB(sessionId, { status: 'disconnected' });
          
          this.emitToUser(userId, 'session-disconnected', { 
            sessionId, 
            reason: `Health check failed: ${error.message}` 
          });
        }
        
        clearInterval(healthCheckInterval);
      }
    }, 60000); // Check every 60 seconds

    // Store health check interval for cleanup
    this.timeouts.set(`${sessionId}_health`, healthCheckInterval);
  }

  // Start health monitoring for a connected session
  startHealthMonitoring(sessionId, userId) {
    // Clear any existing health check
    this.clearTimeout(`${sessionId}_health`);
    
    const healthCheckInterval = setInterval(async () => {
      try {
        const session = this.sessions.get(sessionId);
        if (!session || session.data.status !== 'connected') {
          clearInterval(healthCheckInterval);
          return;
        }

        // Check if client is still responsive
        const client = session.client;
        if (client) {
          try {
            const state = await Promise.race([
              client.getState(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Health check timeout')), 10000)
              )
            ]);
            
            if (state !== 'CONNECTED') {
              console.log(`⚠️ Session ${sessionId} health check failed: state = ${state}`);
              session.data.status = 'disconnected';
              this.emitToUser(userId, 'session-disconnected', {
                sessionId,
                reason: 'WhatsApp session became disconnected'
              });
              clearInterval(healthCheckInterval);
            } else {
              console.log(`✅ Session ${sessionId} health check passed`);
              // Keep session active by getting contacts (lightweight operation)
              try {
                await client.getContacts();
              } catch (keepAliveError) {
                console.log(`⚠️ Keep-alive failed for ${sessionId}: ${keepAliveError.message}`);
              }
            }
          } catch (error) {
            console.log(`❌ Session ${sessionId} health check error: ${error.message}`);
            session.data.status = 'disconnected';
            this.emitToUser(userId, 'session-disconnected', {
              sessionId,
              reason: 'WhatsApp session health check failed'
            });
            clearInterval(healthCheckInterval);
          }
        }
      } catch (error) {
        console.error(`❌ Health monitoring error for ${sessionId}:`, error);
      }
    }, 60000); // Check every minute

    this.timeouts.set(`${sessionId}_health`, healthCheckInterval);
  }

  // Send updated sessions list to user
  sendUpdatedSessionsToUser(userId) {
    try {
      const userSessions = this.getUserSessions(userId);
      this.emitToUser(userId, 'sessions-data', userSessions);
      console.log(`📊 Sent ${userSessions.length} sessions to user ${userId}`);
    } catch (error) {
      console.error(`❌ Error sending sessions to user ${userId}:`, error.message);
    }
  }
}

export default SessionManager;