// utils/cronJobs-safe.js - Simplified and safer version
import cron from 'node-cron';
import Session from '../models/Session.js';
import CampaignLog from '../models/CampaignLog.js';
import MessageLog from '../models/MessageLog.js';
import Upload from '../models/Upload.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cleanupJob = null;
let isCleanupRunning = false;

async function performDatabaseCleanup() {
  if (isCleanupRunning) {
    console.log('🔄 Cleanup already in progress, skipping...');
    return { success: false, message: 'Already running' };
  }

  isCleanupRunning = true;
  const startTime = Date.now();
  
  let sessionsCleaned = 0;
  let campaignsCleaned = 0;
  let messagesCleaned = 0;
  let uploadsCleaned = 0;
  let filesCleaned = 0;

  try {
    console.log('🧹 Starting database cleanup job...');

    // 1. Clean up old sessions (more than 24 hours inactive and disconnected)
    try {
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await Session.deleteMany({
        lastActivity: { $lt: cutoffTime },
        status: { $in: ['disconnected', 'destroyed', 'failed'] }
      });
      sessionsCleaned = result.deletedCount;
      console.log(`🔌 Cleaned ${sessionsCleaned} old sessions`);
    } catch (sessionError) {
      console.error('❌ Error cleaning sessions:', sessionError.message);
    }
    
    // 2. Clean up old campaigns (more than 7 days old)
    try {
      const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = await CampaignLog.deleteMany({
        createdAt: { $lt: cutoffTime }
      });
      campaignsCleaned = result.deletedCount;
      console.log(`📋 Cleaned ${campaignsCleaned} old campaigns`);
    } catch (campaignError) {
      console.error('❌ Error cleaning campaigns:', campaignError.message);
    }
    
    // 3. Clean up old message logs (more than 30 days old)
    try {
      const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = await MessageLog.deleteMany({
        sentAt: { $lt: cutoffTime }
      });
      messagesCleaned = result.deletedCount;
      console.log(`💬 Cleaned ${messagesCleaned} old messages`);
    } catch (messageError) {
      console.error('❌ Error cleaning messages:', messageError.message);
    }
    
    // 4. Clean up old uploads (more than 7 days old) - simplified
    try {
      const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const oldUploads = await Upload.find({
        uploadedAt: { $lt: cutoffTime }
      });

      for (const upload of oldUploads) {
        try {
          if (upload.path && fs.existsSync(upload.path)) {
            fs.unlinkSync(upload.path);
          }
          await Upload.findByIdAndDelete(upload._id);
          uploadsCleaned++;
        } catch (fileError) {
          console.warn(`⚠️ Failed to delete upload ${upload.filename}:`, fileError.message);
        }
      }
      console.log(`📤 Cleaned ${uploadsCleaned} upload files`);
    } catch (uploadError) {
      console.error('❌ Error cleaning uploads:', uploadError.message);
    }

    // 5. Clean up session files on disk (simplified and safer)
    try {
      const sessionsPath = path.resolve(__dirname, '../sessions');
      if (fs.existsSync(sessionsPath)) {
        const sessionFolders = fs.readdirSync(sessionsPath)
          .filter(item => {
            const fullPath = path.join(sessionsPath, item);
            try {
              return fs.statSync(fullPath).isDirectory();
            } catch {
              return false;
            }
          });

        for (const folder of sessionFolders) {
          try {
            const folderPath = path.join(sessionsPath, folder);
            const stats = fs.statSync(folderPath);
            const age = Date.now() - stats.mtime.getTime();
            
            // Remove folders older than 7 days
            if (age > 7 * 24 * 60 * 60 * 1000) {
              const sessionExists = await Session.findOne({ sessionId: folder });
              if (!sessionExists || sessionExists.status === 'destroyed') {
                fs.rmSync(folderPath, { recursive: true, force: true });
                filesCleaned++;
                console.log(`🗑️ Removed old session folder: ${folder}`);
              }
            }
          } catch (folderError) {
            console.warn(`⚠️ Error processing folder ${folder}:`, folderError.message);
          }
        }
      } else {
        console.log('📁 Sessions directory not found, creating...');
        fs.mkdirSync(sessionsPath, { recursive: true });
      }
      console.log(`📁 Cleaned ${filesCleaned} session folders`);
    } catch (fileError) {
      console.error('❌ Error cleaning session files:', fileError.message);
    }

    const duration = Date.now() - startTime;
    
    console.log('✅ Database cleanup completed successfully');
    console.log(`📊 Cleanup summary (${duration}ms):`);
    console.log(`   🗑️ Sessions: ${sessionsCleaned}, 📋 Campaigns: ${campaignsCleaned}`);
    console.log(`   💬 Messages: ${messagesCleaned}, 📤 Uploads: ${uploadsCleaned}, 📁 Files: ${filesCleaned}`);

    return {
      success: true,
      duration,
      cleaned: { sessionsCleaned, campaignsCleaned, messagesCleaned, uploadsCleaned, filesCleaned }
    };

  } catch (error) {
    console.error('❌ Database cleanup failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    isCleanupRunning = false;
  }
}

export function startCleanupJob() {
  return new Promise((resolve) => {
    try {
      console.log('⏰ Initializing safe cleanup job (daily at 2 AM UTC)...');
      
      // Validate dependencies
      if (!cron || typeof cron.schedule !== 'function') {
        console.warn('⚠️  node-cron is not available');
        return resolve(null);
      }

      // Stop existing job if running
      if (cleanupJob) {
        try {
          cleanupJob.stop();
          cleanupJob = null;
          console.log('🛑 Stopped existing cleanup job');
        } catch (stopError) {
          console.warn('⚠️  Error stopping existing job:', stopError.message);
        }
      }

      // Schedule with extensive error handling
      try {
        cleanupJob = cron.schedule('0 2 * * *', async () => {
          try {
            console.log('🕒 Scheduled cleanup job triggered at 2 AM UTC');
            const result = await performDatabaseCleanup();
            if (result.success) {
              console.log('✅ Scheduled cleanup completed successfully');
            } else {
              console.warn('⚠️  Scheduled cleanup had issues:', result.message || result.error);
            }
          } catch (cronError) {
            console.error('❌ Error in scheduled cleanup job:', cronError.message);
            // Never crash the server from within the cron job
          }
        }, {
          scheduled: true,
          timezone: 'UTC'
        });

        console.log('✅ Safe cleanup job scheduled successfully');
        
        // Give it a moment to initialize properly
        setTimeout(() => {
          resolve(cleanupJob);
        }, 200);

      } catch (scheduleError) {
        console.error('❌ Failed to schedule cleanup job:', scheduleError.message);
        resolve(null);
      }

    } catch (error) {
      console.error('❌ Failed to start cleanup job:', error.message);
      resolve(null);
    }
  });
}

export function stopCleanupJob() {
  try {
    if (cleanupJob) {
      cleanupJob.stop();
      cleanupJob = null;
      console.log('🛑 Cleanup job stopped successfully');
      return true;
    }
    console.log('ℹ️  No cleanup job to stop');
    return false;
  } catch (error) {
    console.error('❌ Error stopping cleanup job:', error.message);
    return false;
  }
}

export async function triggerManualCleanup() {
  try {
    console.log('🔧 Manual cleanup triggered...');
    const result = await performDatabaseCleanup();
    console.log('✅ Manual cleanup completed');
    return result;
  } catch (error) {
    console.error('❌ Manual cleanup failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Default export for flexibility
export default {
  startCleanupJob,
  stopCleanupJob,
  triggerManualCleanup,
  performDatabaseCleanup
};
