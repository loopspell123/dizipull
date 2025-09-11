import Session from '../models/Session.js';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Production-friendly network check
async function performNetworkCheck() {
  const results = {
    internet: true, // Default to true in production
    whatsapp: false,
    details: {}
  };

  // In production environments, assume connectivity is available
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    console.log('Production environment detected - assuming internet connectivity');
    results.internet = true;
    results.whatsapp = true; // Don't block on WhatsApp Web check
    results.details.internet = 'Assumed available in production';
    results.details.whatsapp = 'Assumed available in production';
    return results;
  }

  // Only do detailed checks in development
  try {
    const https = await import('https');
    await new Promise((resolve, reject) => {
      const req = https.default.request('https://www.google.com', { method: 'HEAD', timeout: 3000 }, (res) => {
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });
      req.setTimeout(3000);
      req.end();
    });
    
    results.internet = true;
    results.details.internet = 'Connected';
  } catch (error) {
    console.log('Development network check failed:', error.message);
    results.details.internet = `Failed: ${error.message}`;
  }

  return results;
}

class SessionManager {
  constructor(io) {
    this.io = io;
    this.sessions = new Map();
    this.userSockets = new Map();
    this.timeouts = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 3;
  }

  // Main session creation method with production fixes
  async createSession(sessionId, userId, socket, options = {}) {
    const { persistent = true } = options;
    
    try {
      console.log(`Creating WhatsApp session: ${sessionId} for user: ${userId}`);

      // Production-friendly network check
      try {
        const networkStatus = await performNetworkCheck();
        if (!networkStatus.internet && process.env.NODE_ENV !== 'production') {
          throw new Error('No internet connectivity detected');
        }
        console.log('Network check passed or skipped for production');
      } catch (networkError) {
        console.log('Network check failed:', networkError.message);
        // Don't fail session creation in production
        if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
          console.log('Continuing with session creation in production environment');
        } else {
          throw networkError;
        }
      }

      // Check session limits
      const userSessions = this.getUserSessions(userId);
      if (userSessions.length >= 3) {
        throw new Error('Maximum 3 sessions per user allowed. Please delete an existing session first.');
      }

      // Clean up existing session with same ID
      if (this.sessions.has(sessionId)) {
        console.log(`Destroying existing session: ${sessionId}`);
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
          console.warn(`Database save failed for ${sessionId}:`, dbError.message);
        }
      }

      // Create WhatsApp client with production-optimized configuration
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
            '--disable-sync',
            // Production environment optimizations
            '--no-zygote',
            '--disable-accelerated-2d-canvas',
            '--disable-accelerated-jpeg-decoding',
            '--disable-accelerated-mjpeg-decode',
            '--disable-accelerated-video-decode',
            '--disable-accelerated-video-encode',
            '--disable-app-list-dismiss-on-blur',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blacklist',
            '--ignore-certificate-errors',
            '--ignore-ssl-errors',
            '--ignore-certificate-errors-spki-list',
            '--disable-logging',
            '--silent'
          ],
          timeout: 120000, // Increased timeout for production
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
          authFailures: 0,
          createdAt: new Date()
        }
      };

      this.sessions.set(sessionId, sessionData);
      if (socket) {
        this.userSockets.set(userId, socket);
      }

      // Set initialization timeout (5 minutes for production)
      const initTimeout = setTimeout(() => {
        console.log(`Initialization timeout for ${sessionId}`);
        const session = this.sessions.get(sessionId);
        if (session && !['waiting_scan', 'connected', 'authenticated'].includes(session.data.status)) {
          session.data.status = 'timeout';
          this.emitToUser(userId, 'session-error', {
            sessionId,
            error: 'Session initialization timeout - please try again'
          });
          setTimeout(() => this.destroySession(sessionId), 1000);
        }
      }, 300000); // 5 minutes

      this.timeouts.set(`${sessionId}_init`, initTimeout);

      // Setup event handlers
      this.setupEventHandlers(sessionId, client, userId);
      
      // Initialize client with retry logic
      try {
        await this.initializeWithRetry(client, sessionId, userId);
      } catch (initError) {
        console.error(`Failed to initialize ${sessionId} after retries:`, initError.message);
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
      console.error(`Error creating session ${sessionId}:`, error);
      
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
        console.log(`QR Code generated for ${sessionId}`);
        
        const qrCodeDataUrl = await QRCode.toDataURL(qr, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' }
        });

        const session = this.sessions.get(sessionId);
        if (session) {
          this.clearTimeout(`${sessionId}_qr`);
          
          session.data.status = 'waiting_scan';
          session.data.qrCode = qrCodeDataUrl;
          session.data.qrRetries++;
          session.data.lastActivity = new Date();

          this.clearTimeout(`${sessionId}_init`);

          console.log(`QR code ready for ${sessionId} (attempt ${session.data.qrRetries})`);

          this.emitToUser(userId, 'qr-code', {
            sessionId,
            qrCode: qrCodeDataUrl,
            status: 'waiting_scan',
            retries: session.data.qrRetries
          });

          // Set QR timeout (8 minutes for better UX)
          const qrTimeout = setTimeout(() => {
            console.log(`QR expired for ${sessionId}`);
            const currentSession = this.sessions.get(sessionId);
            if (currentSession && currentSession.data.status === 'waiting_scan') {
              currentSession.data.status = 'qr_expired';
              this.emitToUser(userId, 'qr-expired', { sessionId });
            }
          }, 480000); // 8 minutes

          this.timeouts.set(`${sessionId}_qr`, qrTimeout);
        }

      } catch (error) {
        console.error(`QR generation error for ${sessionId}:`, error);
      }
    });

    // Authentication success
    client.on('authenticated', async () => {
      console.log(`${sessionId} authenticated`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.data.status = 'authenticated';
        session.data.lastActivity = new Date();
        
        this.clearTimeout(`${sessionId}_qr`);
        
        await this.updateSessionInDB(sessionId, { status: 'authenticated' });

        this.emitToUser(userId, 'session-authenticated', { sessionId });
        this.sendUpdatedSessionsToUser(userId);
      }
    });

    // Client ready
    client.on('ready', async () => {
      console.log(`${sessionId} ready and connected`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        try {
          session.data.status = 'connected';
          session.data.phoneNumber = client.info?.wid?.user || 'Unknown';
          session.data.lastActivity = new Date();

          await this.updateSessionInDB(sessionId, {
            status: 'connected',
            phoneNumber: session.data.phoneNumber
          });

          this.emitToUser(userId, 'session-ready', {
            sessionId,
            status: 'connected',
            phoneNumber: session.data.phoneNumber
          });

          this.sendUpdatedSessionsToUser(userId);
          this.startHealthMonitoring(sessionId, userId);

          // Clear reconnect attempts on successful connection
          this.reconnectAttempts.delete(sessionId);

          // Fetch groups after delay
          setTimeout(async () => {
            try {
              await this.fetchGroups(sessionId);
            } catch (error) {
              console.error(`Error fetching groups for ${sessionId}:`, error);
            }
          }, 5000);

        } catch (error) {
          console.error(`Error in ready handler for ${sessionId}:`, error);
        }
      }
    });

    // Disconnection with auto-reconnect
    client.on('disconnected', async (reason) => {
      console.log(`${sessionId} disconnected: ${reason}`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.data.status = 'disconnected';
        session.data.lastActivity = new Date();
        
        await this.updateSessionInDB(sessionId, { status: 'disconnected' });
        
        this.emitToUser(userId, 'session-disconnected', { sessionId, reason });

        // Attempt auto-reconnect if session is persistent
        if (session.data.persistent && reason !== 'LOGOUT') {
          this.scheduleReconnect(sessionId, userId);
        }
      }
    });

    // Enhanced error handling
    client.on('error', async (error) => {
      console.log(`Client error for ${sessionId}:`, error.message);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        if (error.message.includes('ERR_SOCKET_NOT_CONNECTED') || 
            error.message.includes('ERR_NETWORK_CHANGED') ||
            error.message.includes('ERR_INTERNET_DISCONNECTED') ||
            error.message.includes('Protocol error')) {
          
          console.log(`Network connectivity issue detected for ${sessionId}`);
          session.data.status = 'network_error';
          
          this.emitToUser(userId, 'session-error', { 
            sessionId, 
            error: 'Network connectivity issue. Attempting to reconnect...' 
          });
          
          // Schedule reconnect
          this.scheduleReconnect(sessionId, userId, 10000);
          
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
      console.log(`Auth failed for ${sessionId}: ${msg}`);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.data.status = 'auth_failure';
        session.data.authFailures++;
        
        this.emitToUser(userId, 'session-error', { 
          sessionId, 
          error: `Authentication failed: ${msg}` 
        });

        if (session.data.authFailures >= 3) {
          console.log(`Removing ${sessionId} after 3 auth failures`);
          await this.destroySession(sessionId);
        }
      }
    });
  }

  // Schedule reconnection with exponential backoff
  scheduleReconnect(sessionId, userId, delay = 5000) {
    const attempts = this.reconnectAttempts.get(sessionId) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      console.log(`Max reconnect attempts reached for ${sessionId}`);
      return;
    }

    this.reconnectAttempts.set(sessionId, attempts + 1);
    
    const reconnectDelay = delay * Math.pow(2, attempts); // Exponential backoff
    
    console.log(`Scheduling reconnect for ${sessionId} in ${reconnectDelay}ms (attempt ${attempts + 1})`);
    
    const reconnectTimeout = setTimeout(async () => {
      try {
        const session = this.sessions.get(sessionId);
        if (session && session.data.persistent) {
          console.log(`Attempting reconnect for ${sessionId}`);
          await this.recreateSession(sessionId, userId);
        }
      } catch (error) {
        console.error(`Reconnect failed for ${sessionId}:`, error);
      }
    }, reconnectDelay);

    this.timeouts.set(`${sessionId}_reconnect`, reconnectTimeout);
  }

  // Recreate session for reconnection
  async recreateSession(sessionId, userId) {
    try {
      const existingSession = this.sessions.get(sessionId);
      if (!existingSession) return;

      const persistent = existingSession.data.persistent;
      
      // Clean up existing session
      await this.destroySession(sessionId);
      
      // Wait before recreating
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create new session with same ID
      await this.createSession(sessionId, userId, this.userSockets.get(userId), { persistent });
      
    } catch (error) {
      console.error(`Error recreating session ${sessionId}:`, error);
      const attempts = this.reconnectAttempts.get(sessionId) || 0;
      if (attempts < this.maxReconnectAttempts) {
        this.scheduleReconnect(sessionId, userId, 15000);
      }
    }
  }

  // Fetch WhatsApp groups
  async fetchGroups(sessionId) {
    try {
      console.log(`Fetching groups for ${sessionId}`);
      
      const session = this.sessions.get(sessionId);
      if (!session || !session.client) {
        throw new Error('Session or client not found');
      }

      const chats = await Promise.race([
        session.client.getChats(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Fetch groups timeout')), 30000)
        )
      ]);

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

      console.log(`Found ${groups.length} groups for ${sessionId}`);

      session.data.groups = groups;
      
      await this.updateSessionInDB(sessionId, { groups });
      
      this.emitToUser(session.data.userId, 'groups-loaded', {
        sessionId,
        groups,
        phoneNumber: session.data.phoneNumber
      });

      return groups;

    } catch (error) {
      console.error(`Error fetching groups for ${sessionId}:`, error);
      throw error;
    }
  }

  // Graceful logout
  async gracefulLogout(sessionId, reason = 'user_logout') {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    try {
      console.log(`Graceful logout for session: ${sessionId} (reason: ${reason})`);
      
      this.clearTimeouts(sessionId);
      
      if (session.client && session.data.status === 'connected') {
        await Promise.race([
          session.client.logout(),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      }

      session.data.status = 'disconnected';
      session.data.lastActivity = new Date();

      await this.updateSessionInDB(sessionId, { status: 'disconnected' });

      this.emitToUser(session.data.userId, 'session-logged-out', {
        sessionId,
        status: 'disconnected',
        message: 'Session logged out successfully'
      });

      return true;

    } catch (error) {
      console.error(`Error during graceful logout for ${sessionId}:`, error);
      throw error;
    }
  }

  // Force disconnect
  async forceDisconnect(sessionId, reason = 'force_disconnect') {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      console.log(`Force disconnecting session: ${sessionId} (reason: ${reason})`);

      this.clearTimeouts(sessionId);

      if (session.client) {
        try {
          await Promise.race([
            session.client.destroy(),
            new Promise(resolve => setTimeout(resolve, 3000))
          ]);
        } catch (error) {
          console.warn(`Warning force disconnecting client ${sessionId}:`, error.message);
        }
      }

      session.data.status = 'disconnected';
      session.data.lastActivity = new Date();

      await this.updateSessionInDB(sessionId, { 
        status: 'disconnected',
        lastActivity: new Date()
      });

      this.emitToUser(session.data.userId, 'session-force-disconnected', {
        sessionId,
        reason,
        message: 'Session forcefully disconnected'
      });

      return true;

    } catch (error) {
      console.error(`Error force disconnecting session ${sessionId}:`, error);
      return false;
    }
  }

  // Destroy session completely
  async destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`Session ${sessionId} not found for destruction`);
      return;
    }

    try {
      console.log(`Destroying session: ${sessionId}`);

      this.clearTimeouts(sessionId);
      this.reconnectAttempts.delete(sessionId);

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

      this.sessions.delete(sessionId);

      await this.updateSessionInDB(sessionId, { status: 'destroyed' });

      this.emitToUser(session.data.userId, 'session-destroyed', {
        sessionId,
        message: 'Session destroyed successfully'
      });

      console.log(`Session ${sessionId} destroyed`);

    } catch (error) {
      console.error(`Error destroying session ${sessionId}:`, error);
      this.sessions.delete(sessionId);
    }
  }

  // Helper methods
  getUserSessions(userId) {
    const userSessions = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.data.userId === userId) {
        userSessions.push({
          id: sessionId,
          sessionId,
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
      console.warn(`Database update failed for ${sessionId}:`, error.message);
    }
  }

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

  async initializeWithRetry(client, sessionId, userId, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      console.log(`Initializing ${sessionId} (attempt ${retryCount + 1}/${maxRetries + 1})`);
      await client.initialize();
    } catch (error) {
      console.error(`Initialization failed for ${sessionId}:`, error.message);
      
      if (retryCount < maxRetries && 
          (error.message.includes('ERR_SOCKET_NOT_CONNECTED') || 
           error.message.includes('ERR_NETWORK_CHANGED') ||
           error.message.includes('ERR_INTERNET_DISCONNECTED') ||
           error.message.includes('Protocol error'))) {
        
        const delay = (retryCount + 1) * 3000;
        console.log(`Retrying ${sessionId} in ${delay}ms...`);
        
        const session = this.sessions.get(sessionId);
        if (session) {
          session.data.status = 'retrying';
          this.emitToUser(userId, 'session-status', { 
            sessionId, 
            status: 'retrying',
            message: `Network error. Retrying in ${delay/1000} seconds...`
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.initializeWithRetry(client, sessionId, userId, retryCount + 1);
      } else {
        throw error;
      }
    }
  }

  startHealthMonitoring(sessionId, userId) {
    this.clearTimeout(`${sessionId}_health`);
    
    const healthCheckInterval = setInterval(async () => {
      try {
        const session = this.sessions.get(sessionId);
        if (!session || session.data.status !== 'connected') {
          clearInterval(healthCheckInterval);
          return;
        }

        const client = session.client;
        if (client) {
          try {
            const state = await Promise.race([
              client.getState(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Health check timeout')), 15000)
              )
            ]);
            
            if (state !== 'CONNECTED') {
              console.log(`Session ${sessionId} health check failed: state = ${state}`);
              session.data.status = 'disconnected';
              this.emitToUser(userId, 'session-disconnected', {
                sessionId,
                reason: 'Connection lost during health check'
              });
              clearInterval(healthCheckInterval);
              
              // Schedule reconnect if persistent
              if (session.data.persistent) {
                this.scheduleReconnect(sessionId, userId);
              }
            } else {
              console.log(`Session ${sessionId} health check passed`);
            }
          } catch (error) {
            console.log(`Session ${sessionId} health check error: ${error.message}`);
            session.data.status = 'disconnected';
            this.emitToUser(userId, 'session-disconnected', {
              sessionId,
              reason: 'Health check failed'
            });
            clearInterval(healthCheckInterval);
            
            // Schedule reconnect if persistent
            if (session.data.persistent) {
              this.scheduleReconnect(sessionId, userId);
            }
          }
        }
      } catch (error) {
        console.error(`Health monitoring error for ${sessionId}:`, error);
      }
    }, 90000); // Check every 90 seconds

    this.timeouts.set(`${sessionId}_health`, healthCheckInterval);
  }

  sendUpdatedSessionsToUser(userId) {
    try {
      const userSessions = this.getUserSessions(userId);
      this.emitToUser(userId, 'sessions-data', userSessions);
      console.log(`Sent ${userSessions.length} sessions to user ${userId}`);
    } catch (error) {
      console.error(`Error sending sessions to user ${userId}:`, error.message);
    }
  }

  // Cleanup method for old sessions
  async performCleanup() {
    console.log('Performing session cleanup...');
    
    const now = Date.now();
    const sessionsToCleanup = [];

    for (const [sessionId, session] of this.sessions) {
      const lastActivity = session.data.lastActivity?.getTime() || now;
      const age = now - lastActivity;
      
      // Clean up sessions older than 48 hours and not connected
      const isOldAndDisconnected = age > (48 * 60 * 60 * 1000) && 
                                   !['connected', 'waiting_scan'].includes(session.data.status);
      
      if (isOldAndDisconnected) {
        sessionsToCleanup.push(sessionId);
      }
    }

    for (const sessionId of sessionsToCleanup) {
      await this.destroySession(sessionId);
    }

    console.log(`Cleaned up ${sessionsToCleanup.length} sessions`);
  }

  // Cleanup user sessions (keep only the most recent ones)
  async cleanupUserSessions(userId, maxSessions = 2) {
    const userSessions = this.getUserSessions(userId);
    
    if (userSessions.length <= maxSessions) {
      return;
    }

    // Sort by last activity, keep the most recent
    const sortedSessions = userSessions.sort((a, b) => 
      new Date(b.lastActivity) - new Date(a.lastActivity)
    );

    const sessionsToRemove = sortedSessions.slice(maxSessions);
    
    for (const session of sessionsToRemove) {
      if (session.status !== 'connected') {
        await this.destroySession(session.sessionId);
      }
    }

    console.log(`Cleaned up ${sessionsToRemove.length} old sessions for user ${userId}`);
  }
}

export default SessionManager;