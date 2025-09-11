// Group Loading Fix for SessionManager
// Add this improved group fetching method to sessionManager.js

const groupLoadingFix = {
  // Improved group fetching method with retry logic
  async fetchGroupsWithRetry(sessionId, maxRetries = 3) {
    console.log(`🔍 Fetching groups for session ${sessionId} with retry logic`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.getClient(sessionId);
        if (!client) {
          throw new Error('No client available');
        }

        console.log(`📱 Attempt ${attempt}/${maxRetries} - Getting chats for ${sessionId}`);
        
        // Add timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 20000); // 20 second timeout
        });

        // Race between getChats and timeout
        const chats = await Promise.race([
          client.getChats(),
          timeoutPromise
        ]);

        const groups = chats
          .filter(chat => chat.isGroup)
          .map(group => ({
            id: group.id._serialized,
            name: group.name || 'Unknown Group',
            participantCount: group.participants?.length || 0,
            isSelected: false,
            lastMessage: group.lastMessage?.body || '',
            timestamp: group.timestamp || Date.now()
          }));

        console.log(`📚 Successfully found ${groups.length} groups for session ${sessionId}`);
        
        // Update session with groups
        if (this.sessions.has(sessionId)) {
          const session = this.sessions.get(sessionId);
          session.groups = groups;
          session.groupsLoaded = true;
          session.lastGroupsFetch = Date.now();
          this.sessions.set(sessionId, session);
        }

        // Emit to all connected clients (not just session room)
        this.io.emit('groups-loaded', {
          sessionId: sessionId,
          groups: groups,
          success: true
        });

        // Also send updated sessions data
        const sessionData = this.sessions.get(sessionId);
        if (sessionData && sessionData.userId) {
          const userSessions = await this.getUserSessions(sessionData.userId);
          this.io.emit('sessions-data', userSessions);
        }

        console.log(`📡 Successfully emitted ${groups.length} groups for session ${sessionId}`);
        return groups;

      } catch (error) {
        console.log(`❌ Attempt ${attempt}/${maxRetries} failed for session ${sessionId}: ${error.message}`);
        
        if (attempt === maxRetries) {
          console.log(`💀 All attempts failed for session ${sessionId}`);
          
          // Emit failure event
          this.io.emit('groups-loaded', {
            sessionId: sessionId,
            groups: [],
            success: false,
            error: error.message
          });
          
          return [];
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      }
    }
  },

  // Also add this method to manually trigger group refresh
  async refreshGroups(sessionId) {
    console.log(`🔄 Manual group refresh triggered for session ${sessionId}`);
    return await this.fetchGroupsWithRetry(sessionId, 2);
  }
};

module.exports = groupLoadingFix;

console.log('📋 Add these methods to sessionManager.js to improve group loading');

console.log('📋 Add these methods to sessionManager.js to improve group loading');