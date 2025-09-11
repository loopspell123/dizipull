// Session management configuration
const SESSION_CONFIG = {
  MAX_SESSIONS_PER_USER: 3,
  MAX_QR_RETRIES: 5,
  QR_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  SESSION_CLEANUP_INTERVAL: 60 * 600 * 10000, // 1 hour
  MAX_SESSION_AGE: 24 * 600 * 600 * 10000, // 24 hours
  AUTO_CLEANUP_ENABLED: false
};

// Auto cleanup job for sessions
let cleanupInterval;

const startSessionCleanup = () => {
  if (!SESSION_CONFIG.AUTO_CLEANUP_ENABLED) return;
  
  console.log('🧹 Starting automatic session cleanup job...');
  
  cleanupInterval = setInterval(async () => {
    try {
      await sessionManager.performAutoCleanup();
      
      // Log session statistics every hour
      const stats = sessionManager.getSessionStats();
      console.log('📊 Current session statistics:', stats);
      
      // Alert if too many sessions
      if (stats.total > 10) {
        console.warn(`⚠️  High session count detected: ${stats.total} total sessions`);
      }
      
    } catch (error) {
      console.error('❌ Error during session cleanup:', error);
    }
  }, SESSION_CONFIG.SESSION_CLEANUP_INTERVAL);
};

const stopSessionCleanup = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🛑 Session cleanup job stopped');
  }
};

// Export session configuration
export { SESSION_CONFIG, startSessionCleanup, stopSessionCleanup };