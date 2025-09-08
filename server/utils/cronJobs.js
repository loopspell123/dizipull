import cron from 'node-cron';
import CampaignLog from '../models/CampaignLog.js';

// Run daily at 2 AM to cleanup old campaigns
export const startCleanupJob = () => {
  try {
    cron.schedule('0 2 * * *', async () => {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const result = await CampaignLog.deleteMany({
          startedAt: { $lt: sevenDaysAgo }
        });

        console.log(`🧹 Cleaned up ${result.deletedCount} old campaigns (older than 7 days)`);
      } catch (error) {
        console.error('❌ Error during campaign cleanup:', error);
      }
    }, {
      timezone: 'UTC'
    });

    console.log('✅ Campaign cleanup job started (runs daily at 2 AM UTC)');
  } catch (error) {
    console.error('❌ Error starting cleanup job:', error);
  }
};
