// utils/cronJobs.js
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
    return;
  }

  isCleanupRunning = true;
  const startTime = Date.now();

  try {
    console.log('🧹 Starting database cleanup job...');

    // Initialize counters with defaults
    let sessionCleanupResult = 0;
    let campaignCleanupResult = 0;
    let messageCleanupResult = 0;
    let uploadCleanupResult = 0;
    let fileCleanupResult = 0;

    // 1. Clean up old sessions (more than 24 hours inactive and disconnected)
    try {
      sessionCleanupResult = await cleanupOldSessions();
    } catch (sessionError) {
      console.error('❌ Error cleaning sessions:', sessionError.message);
    }
    
    // 2. Clean up old campaigns (more than 7 days old)
    try {
      campaignCleanupResult = await cleanupOldCampaigns();
    } catch (campaignError) {
      console.error('❌ Error cleaning campaigns:', campaignError.message);
    }
    
    // 3. Clean up old message logs (more than 30 days old)
    try {
      messageCleanupResult = await cleanupOldMessages();
    } catch (messageError) {
      console.error('❌ Error cleaning messages:', messageError.message);
    }
    
    // 4. Clean up orphaned upload files
    try {
      uploadCleanupResult = await cleanupOldUploads();
    } catch (uploadError) {
      console.error('❌ Error cleaning uploads:', uploadError.message);
    }

    // 5. Clean up session files on disk
    try {
      fileCleanupResult = await cleanupSessionFiles();
    } catch (fileError) {
      console.error('❌ Error cleaning session files:', fileError.message);
    }

    const duration = Date.now() - startTime;
    
    console.log('✅ Campaign cleanup completed successfully');
    console.log(`📊 Cleanup summary (${duration}ms):`);
    console.log(`   🗑️ Sessions cleaned: ${sessionCleanupResult}`);
    console.log(`   📋 Campaigns cleaned: ${campaignCleanupResult}`);
    console.log(`   💬 Messages cleaned: ${messageCleanupResult}`);
    console.log(`   📁 Files cleaned: ${fileCleanupResult}`);
    console.log(`   📤 Uploads cleaned: ${uploadCleanupResult}`);

  } catch (error) {
    console.error('❌ Campaign cleanup failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    isCleanupRunning = false;
  }
}

async function cleanupOldSessions() {
  try {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const result = await Session.deleteMany({
      $or: [
        { status: 'destroyed', updatedAt: { $lt: cutoffTime } },
        { status: 'timeout', updatedAt: { $lt: cutoffTime } },
        { status: 'auth_failure', updatedAt: { $lt: cutoffTime } }
      ]
    });

    console.log(`🗑️ Cleaned ${result.deletedCount} old sessions`);
    return result.deletedCount;

  } catch (error) {
    console.error('❌ Error cleaning old sessions:', error.message);
    return 0;
  }
}

async function cleanupOldCampaigns() {
  try {
    const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    const result = await CampaignLog.deleteMany({
      startedAt: { $lt: cutoffTime },
      status: { $in: ['completed', 'failed', 'cancelled'] }
    });

    console.log(`📋 Cleaned ${result.deletedCount} old campaigns`);
    return result.deletedCount;

  } catch (error) {
    console.error('❌ Error cleaning old campaigns:', error.message);
    return 0;
  }
}

async function cleanupOldMessages() {
  try {
    const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    const result = await MessageLog.deleteMany({
      sentAt: { $lt: cutoffTime }
    });

    console.log(`💬 Cleaned ${result.deletedCount} old messages`);
    return result.deletedCount;

  } catch (error) {
    console.error('❌ Error cleaning old messages:', error.message);
    return 0;
  }
}

async function cleanupOldUploads() {
  try {
    const cutoffTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    // Find old uploads
    const oldUploads = await Upload.find({
      uploadedAt: { $lt: cutoffTime }
    });

    let deletedFiles = 0;
    let deletedRecords = 0;

    for (const upload of oldUploads) {
      try {
        // Delete file from disk
        if (fs.existsSync(upload.path)) {
          fs.unlinkSync(upload.path);
          deletedFiles++;
        }
        
        // Delete database record
        await Upload.findByIdAndDelete(upload._id);
        deletedRecords++;
        
      } catch (fileError) {
        console.warn(`⚠️ Failed to delete upload ${upload.filename}:`, fileError.message);
      }
    }

    console.log(`📤 Cleaned ${deletedRecords} upload records and ${deletedFiles} files`);
    return deletedRecords;

  } catch (error) {
    console.error('❌ Error cleaning old uploads:', error.message);
    return 0;
  }
}

async function cleanupSessionFiles() {
  try {
    const sessionsPath = path.resolve(__dirname, '../sessions');
    
    // Check if sessions directory exists
    if (!fs.existsSync(sessionsPath)) {
      console.log('📁 Sessions directory not found, creating...');
      fs.mkdirSync(sessionsPath, { recursive: true });
      return 0;
    }

    const sessionFolders = fs.readdirSync(sessionsPath)
      .filter(item => {
        const fullPath = path.join(sessionsPath, item);
        return fs.statSync(fullPath).isDirectory();
      });

    let cleanedFolders = 0;

    for (const folder of sessionFolders) {
      try {
        const folderPath = path.join(sessionsPath, folder);
        const stats = fs.statSync(folderPath);
        const age = Date.now() - stats.mtime.getTime();
        
        // Remove folders older than 7 days
        if (age > 7 * 24 * 60 * 60 * 1000) {
          // Check if session still exists in database
          const sessionExists = await Session.findOne({ sessionId: folder });
          
          if (!sessionExists || sessionExists.status === 'destroyed') {
            fs.rmSync(folderPath, { recursive: true, force: true });
            cleanedFolders++;
            console.log(`🗑️ Removed old session folder: ${folder}`);
          }
        }
      } catch (folderError) {
        console.warn(`⚠️ Error processing folder ${folder}:`, folderError.message);
      }
    }

    console.log(`📁 Cleaned ${cleanedFolders} session folders`);
    return cleanedFolders;

  } catch (error) {
    console.error('❌ Error cleaning session files:', error.message);
    return 0;
  }
}

export function startCleanupJob() {
  return new Promise((resolve) => {
    try {
      console.log('⏰ Setting up campaign cleanup job (daily at 2 AM UTC)...');
      
      // Validate cron is available
      if (!cron || typeof cron.schedule !== 'function') {
        console.warn('⚠️  node-cron is not properly installed or imported');
        return resolve(null);
      }

      // Stop existing job if running
      if (cleanupJob) {
        try {
          cleanupJob.stop();
          cleanupJob = null;
        } catch (stopError) {
          console.warn('⚠️  Error stopping existing cleanup job:', stopError.message);
        }
      }

      // Schedule cleanup job - runs daily at 2 AM UTC with proper error handling
      cleanupJob = cron.schedule('0 2 * * *', async () => {
        try {
          console.log('🕒 Scheduled cleanup job triggered at 2 AM UTC');
          await performDatabaseCleanup();
        } catch (cronError) {
          console.error('❌ Error in scheduled cleanup job:', cronError.message);
          // Don't let cron job errors crash the server
        }
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      console.log('✅ Campaign cleanup job started (runs daily at 2 AM UTC)');

      // Don't run initial cleanup to prevent server crashes
      // Initial cleanup is disabled for stability
      
      resolve(cleanupJob);

    } catch (error) {
      console.error('❌ Failed to start cleanup job:', error.message);
      console.error('Stack trace:', error.stack);
      
      // Don't crash the server, just log the error
      console.warn('⚠️  Server will continue without cleanup job');
      resolve(null);
    }
  });
}

export function stopCleanupJob() {
  if (cleanupJob) {
    cleanupJob.stop();
    cleanupJob = null;
    console.log('🛑 Cleanup job stopped');
  }
}

export async function triggerManualCleanup() {
  console.log('🔧 Manual cleanup triggered...');
  await performDatabaseCleanup();
}

export default {
  startCleanupJob,
  stopCleanupJob,
  triggerManualCleanup
};