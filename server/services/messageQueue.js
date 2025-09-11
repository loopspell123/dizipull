import MessageLog from '../models/MessageLog.js';
import Upload from '../models/Upload.js';
import CampaignLog from '../models/CampaignLog.js';
import pkg from 'whatsapp-web.js';
const { MessageMedia } = pkg;

class MessageQueue {
  constructor(io, sessionManager) {
    this.io = io;
    this.sessionManager = sessionManager;
    this.queue = [];
    this.processing = false;
    this.bulkCampaigns = new Map();
  }

  async addMessage(sessionId, groupId, message, mediaId = null, campaignId = null) {
    const messageTask = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      groupId,
      message,
      mediaId,
      campaignId,
      attempts: 0,
      createdAt: new Date()
    };

    this.queue.push(messageTask);

    if (!this.processing) {
      this.processQueue();
    }

    return messageTask.id;
  }

  async processQueue() {
    if (this.processing) return;
    
    this.processing = true;
    console.log(`🔄 Starting queue processing with ${this.queue.length} messages`);
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      await this.processMessage(task);
      
      // Delay between messages
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    this.processing = false;
    console.log('✅ Queue processing completed');
  }

  async processMessage(task) {
    console.log(`📤 Processing message: ${task.id} for group ${task.groupId}`);
    
    const session = this.sessionManager.getSession(task.sessionId);
    if (!session || session.data.status !== 'connected') {
      console.log(`❌ Session not ready for ${task.id}`);
      
      const errorResult = {
        taskId: task.id,
        sessionId: task.sessionId,
        groupId: task.groupId,
        success: false,
        error: 'Session not connected',
        timestamp: new Date()
      };

      this.emitResult(session?.data.userId, errorResult);
      await this.logFailedMessage(task, 'Session not connected');
      return;
    }

    try {
      console.log(`📞 Sending message to ${task.groupId}...`);
      const result = await this.sendMessage(task);
      console.log(`✅ Message sent successfully: ${result.id._serialized}`);
      
      // Update stats
      session.data.messagesSent = (session.data.messagesSent || 0) + 1;
      session.data.lastActivity = new Date();
      
      await this.logSuccessMessage(task, result);
      
      const successResult = {
        taskId: task.id,
        sessionId: task.sessionId,
        groupId: task.groupId,
        success: true,
        messageId: result.id._serialized,
        timestamp: new Date()
      };

      this.emitResult(session.data.userId, successResult);

    } catch (error) {
      console.error(`❌ Send failed for ${task.id}:`, error.message);
      
      if (task.attempts < 2) {
        task.attempts++;
        console.log(`🔄 Retrying message ${task.id} (attempt ${task.attempts + 1}/3)`);
        setTimeout(() => {
          this.queue.unshift(task);
          if (!this.processing) this.processQueue();
        }, 5000);
      } else {
        console.log(`💀 Final failure for message ${task.id}`);
        await this.logFailedMessage(task, error.message);
        
        const errorResult = {
          taskId: task.id,
          sessionId: task.sessionId,
          groupId: task.groupId,
          success: false,
          error: error.message,
          finalAttempt: true,
          timestamp: new Date()
        };

        this.emitResult(session.data.userId, errorResult);
      }
    }
  }

  emitResult(userId, resultData) {
    if (!userId) return;
    
    console.log(`📡 Emitting result to user ${userId}:`, {
      success: resultData.success,
      taskId: resultData.taskId,
      error: resultData.error || 'none'
    });

    // Emit to user room
    this.io.to(`user_${userId}`).emit('message-sent', resultData);
    
    // Also emit to direct socket if available
    const userSocket = this.sessionManager.userSockets?.get(userId);
    if (userSocket && userSocket.connected) {
      userSocket.emit('message-sent', resultData);
      console.log(`📡 Direct socket emit to user ${userId} completed`);
    }

    // Update bulk campaign if applicable
    if (resultData.campaignId || (resultData.taskId && resultData.taskId.includes('campaign'))) {
      this.updateBulkCampaignFromResult(resultData);
    }
  }

  async sendMessage(task) {
    const session = this.sessionManager.getSession(task.sessionId);
    if (!session) {
      throw new Error(`Session ${task.sessionId} not found`);
    }
    
    const { client } = session;
    
    // Check if client is still connected
    try {
      const clientInfo = await client.getState();
      console.log(`🔍 Client state for ${task.sessionId}:`, clientInfo);
      
      if (clientInfo !== 'CONNECTED') {
        throw new Error(`Client not connected. State: ${clientInfo}`);
      }
    } catch (error) {
      console.error(`❌ Client health check failed for ${task.sessionId}:`, error.message);
      
      // Update session status
      session.data.status = 'disconnected';
      this.sessionManager.emitToUser(session.data.userId, 'session-disconnected', {
        sessionId: task.sessionId,
        reason: 'Client session closed during messaging'
      });
      
      throw new Error(`WhatsApp session closed. Please reconnect session ${task.sessionId}.`);
    }
    
    // Add timeout wrapper
    return await Promise.race([
      this._sendMessageInternal(client, task),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Message send timeout after 30 seconds')), 30000)
      )
    ]);
  }

  async _sendMessageInternal(client, task) {
    try {
      // Check if client is still connected
      const clientInfo = await this._checkClientHealth(client, task.sessionId);
      if (!clientInfo.isHealthy) {
        throw new Error(`Client not healthy: ${clientInfo.reason}`);
      }

      if (task.mediaId) {
        const upload = await Upload.findById(task.mediaId);
        if (!upload) throw new Error('Media file not found');
        
        const media = MessageMedia.fromFilePath(upload.path);
        return await client.sendMessage(task.groupId, media, { caption: task.message });
      } else {
        return await client.sendMessage(task.groupId, task.message);
      }
    } catch (error) {
      // Handle specific WhatsApp session errors
      if (error.message.includes('Session closed') || 
          error.message.includes('Protocol error') ||
          error.message.includes('Target closed') ||
          error.message.includes('Client not healthy')) {
        
        console.error(`🔌 WhatsApp session lost for ${task.sessionId}:`, error.message);
        
        // Mark session as disconnected and attempt recovery
        const session = this.sessionManager.getSession(task.sessionId);
        if (session) {
          session.data.status = 'reconnecting';
          this.sessionManager.emitToUser(session.data.userId, 'session-status', {
            sessionId: task.sessionId,
            status: 'reconnecting',
            message: 'WhatsApp session lost, attempting to recover...'
          });
          
          // Try to recover the session
          setTimeout(() => {
            this._attemptSessionRecovery(task.sessionId, session.data.userId);
          }, 3000);
        }
        
        throw new Error('WhatsApp session was closed. Recovery in progress...');
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  // Check if WhatsApp client is healthy
  async _checkClientHealth(client, sessionId) {
    try {
      // Try to get client info - if this fails, client is not healthy
      const state = await Promise.race([
        client.getState(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]);
      
      if (state === 'CONNECTED') {
        return { isHealthy: true };
      } else {
        return { isHealthy: false, reason: `Client state: ${state}` };
      }
    } catch (error) {
      return { isHealthy: false, reason: error.message };
    }
  }

  // Attempt to recover a disconnected session
  async _attemptSessionRecovery(sessionId, userId) {
    try {
      console.log(`🔄 Attempting recovery for session ${sessionId}`);
      
      // Get the session
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        console.log(`❌ Session ${sessionId} not found for recovery`);
        return;
      }

      // Try to reinitialize the WhatsApp client
      if (session.client) {
        try {
          // Check if client can be recovered
          const state = await session.client.getState();
          if (state === 'CONNECTED') {
            console.log(`✅ Session ${sessionId} recovered successfully`);
            session.data.status = 'connected';
            this.sessionManager.emitToUser(userId, 'session-ready', {
              sessionId,
              status: 'connected',
              message: 'Session recovered successfully'
            });
            return;
          }
        } catch (err) {
          console.log(`⚠️ Client recovery failed for ${sessionId}: ${err.message}`);
        }
      }

      // If recovery fails, mark session as needing QR code
      console.log(`❌ Recovery failed for ${sessionId}, requiring QR code`);
      session.data.status = 'disconnected';
      this.sessionManager.emitToUser(userId, 'session-disconnected', {
        sessionId,
        reason: 'Session recovery failed. Please scan QR code again.',
        requiresQR: true
      });

    } catch (error) {
      console.error(`❌ Session recovery error for ${sessionId}:`, error);
    }
  }

  async logSuccessMessage(task, result) {
    const session = this.sessionManager.getSession(task.sessionId);
    const group = session.data.groups?.find(g => g.id === task.groupId);
    
    try {
      await MessageLog.create({
        sessionId: task.sessionId,
        userId: session.data.userId,
        groupId: task.groupId,
        groupName: group?.name || 'Unknown Group',
        message: task.message,
        messageId: result.id._serialized,
        status: 'sent',
        retryCount: task.attempts
      });

      console.log(`✅ Logged successful message: ${task.id}`);

      if (task.campaignId) {
        await this.updateBulkCampaignProgress(task.campaignId, task, true, result);
      }
    } catch (logError) {
      console.error('Error logging successful message:', logError);
    }
  }

  async logFailedMessage(task, error) {
    const session = this.sessionManager.getSession(task.sessionId);
    if (!session) return;
    
    const group = session.data.groups?.find(g => g.id === task.groupId);
    
    try {
      await MessageLog.create({
        sessionId: task.sessionId,
        userId: session.data.userId,
        groupId: task.groupId,
        groupName: group?.name || 'Unknown Group',
        message: task.message,
        status: 'failed',
        error: error,
        retryCount: task.attempts
      });

      console.log(`❌ Logged failed message: ${task.id}`);

      if (task.campaignId) {
        await this.updateBulkCampaignProgress(task.campaignId, task, false, null, error);
      }
    } catch (logError) {
      console.error('Error logging failed message:', logError);
    }
  }

  createBulkCampaign(campaignId, userId, totalTasks) {
    const campaign = {
      campaignId,
      userId,
      totalTasks,
      completedTasks: 0,
      successTasks: 0,
      failedTasks: 0,
      results: [],
      startTime: new Date()
    };

    this.bulkCampaigns.set(campaignId, campaign);
    console.log(`📊 Created bulk campaign tracker: ${campaignId} with ${totalTasks} tasks`);
    
    return campaign;
  }

  async updateBulkCampaignProgress(campaignId, task, success, result = null, error = null) {
    const campaign = this.bulkCampaigns.get(campaignId);
    if (!campaign) {
      console.warn(`⚠️ Campaign ${campaignId} not found in tracker`);
      return;
    }

    campaign.completedTasks++;
    
    const session = this.sessionManager.getSession(task.sessionId);
    const group = session?.data.groups?.find(g => g.id === task.groupId);
    
    const taskResult = {
      groupId: task.groupId,
      groupName: group?.name || 'Unknown Group',
      success,
      error: error || null,
      messageId: result?.id?._serialized || null,
      sentAt: new Date()
    };

    campaign.results.push(taskResult);
    
    if (success) {
      campaign.successTasks++;
    } else {
      campaign.failedTasks++;
    }

    console.log(`📊 Campaign ${campaignId} progress: ${campaign.completedTasks}/${campaign.totalTasks} (${campaign.successTasks} success, ${campaign.failedTasks} failed)`);

    // Update database
    try {
      await CampaignLog.findOneAndUpdate(
        { campaignId },
        {
          successCount: campaign.successTasks,
          failedCount: campaign.failedTasks,
          status: campaign.completedTasks >= campaign.totalTasks ? 'completed' : 'in_progress',
          results: campaign.results,
          completedAt: campaign.completedTasks >= campaign.totalTasks ? new Date() : undefined,
          duration: campaign.completedTasks >= campaign.totalTasks ? (Date.now() - campaign.startTime.getTime()) : undefined
        }
      );
    } catch (dbError) {
      console.error('Error updating campaign log:', dbError);
    }

    // Emit progress update
    const userSocket = this.sessionManager.userSockets?.get(campaign.userId);
    if (userSocket && userSocket.connected) {
      userSocket.emit('bulk-message-progress', {
        campaignId,
        completed: campaign.completedTasks,
        total: campaign.totalTasks,
        success: campaign.successTasks,
        failed: campaign.failedTasks,
        progress: Math.round((campaign.completedTasks / campaign.totalTasks) * 100),
        currentGroup: group?.name || 'Unknown Group'
      });
    }

    // Check if campaign is complete
    if (campaign.completedTasks >= campaign.totalTasks) {
      await this.completeBulkCampaign(campaignId);
    }
  }

  updateBulkCampaignFromResult(resultData) {
    // Find campaign by task ID pattern or campaign ID
    for (const [campaignId, campaign] of this.bulkCampaigns.entries()) {
      if (resultData.campaignId === campaignId || resultData.taskId.includes(campaignId.split('_')[1])) {
        const mockTask = {
          sessionId: resultData.sessionId,
          groupId: resultData.groupId,
          campaignId
        };
        
        const mockResult = resultData.success ? { id: { _serialized: resultData.messageId } } : null;
        
        this.updateBulkCampaignProgress(
          campaignId,
          mockTask,
          resultData.success,
          mockResult,
          resultData.error
        );
        break;
      }
    }
  }

  async completeBulkCampaign(campaignId) {
    const campaign = this.bulkCampaigns.get(campaignId);
    if (!campaign) return;

    console.log(`🏁 Completing bulk campaign: ${campaignId}`);

    const duration = Date.now() - campaign.startTime.getTime();
    
    // Final database update
    try {
      await CampaignLog.findOneAndUpdate(
        { campaignId },
        {
          status: 'completed',
          completedAt: new Date(),
          duration: duration,
          successCount: campaign.successTasks,
          failedCount: campaign.failedTasks,
          results: campaign.results
        }
      );
    } catch (dbError) {
      console.error('Error completing campaign in database:', dbError);
    }

    const userSocket = this.sessionManager.userSockets?.get(campaign.userId);
    if (userSocket && userSocket.connected) {
      userSocket.emit('bulk-message-completed', {
        campaignId,
        summary: {
          total: campaign.totalTasks,
          success: campaign.successTasks,
          failed: campaign.failedTasks,
          duration: duration
        },
        results: campaign.results
      });

      console.log(`📡 Emitted completion for campaign: ${campaignId}`);
    }

    // Clean up
    this.bulkCampaigns.delete(campaignId);
  }
}

export default MessageQueue;
