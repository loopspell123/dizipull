import React, { useState } from 'react';
import { Users, Search, Filter, RefreshCw } from 'lucide-react';
import { useCampaign } from '../contexts/CampaignContext';
import GroupList from '../components/GroupList';

const GroupsPage: React.FC = () => {
  const { sessions, refreshGroups } = useCampaign();
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Calculate connected sessions
  const connectedSessions = sessions.filter((s: any) => s.status === 'connected');

  // Manual refresh handler
  const handleRefreshGroups = async () => {
    setLoadingGroups(true);
    try {
      await Promise.all(
        connectedSessions.map((session: any) => refreshGroups(session.id))
      );
    } finally {
      setLoadingGroups(false);
    }
  };

  const totalGroups = sessions.reduce((total, session) => total + session.groups.length, 0);
  const selectedGroups = sessions.reduce((total, session) => 
    total + session.groups.filter(g => g.isSelected).length, 0
  );

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-black mb-2">WhatsApp Groups</h1>
            <p className="text-black">Manage and select groups for your campaigns</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefreshGroups}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              disabled={loadingGroups}
            >
              <RefreshCw className="w-5 h-5" />
              <span>{loadingGroups ? 'Refreshing...' : 'Refresh Groups'}</span>
            </button>
          </div>
        </div>
      </div>
      {/* Loading indicator */}
      {loadingGroups && (
        <div className="flex items-center justify-center my-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
          <span className="text-blue-600 font-semibold">Loading groups...</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{totalGroups}</p>
              <p className="text-sm text-black">Total Groups</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{selectedGroups}</p>
              <p className="text-sm text-black">Selected</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{connectedSessions.length}</p>
              <p className="text-sm text-black">Active Sessions</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">
                {sessions.reduce((total, session) => 
                  total + session.groups.reduce((sum, group) => sum + (group.participantCount || 0), 0), 0
                )}
              </p>
              <p className="text-sm text-black">Total Members</p>
            </div>
          </div>
        </div>
      </div>

      {/* Groups List */}
      {connectedSessions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-black mb-2">No Connected Sessions</h3>
          <p className="text-gray-600 mb-6">Connect a WhatsApp session first to see your groups</p>
          <button className="inline-flex items-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors">
            <span>Go to Sessions</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {connectedSessions.map((session) => (
            <GroupList key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
};

export default GroupsPage;