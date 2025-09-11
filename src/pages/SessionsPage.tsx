import React, { useState } from 'react';
import { Plus, Smartphone, QrCode, Wifi, WifiOff, RefreshCw, Trash2 } from 'lucide-react';
import { useCampaign } from '../contexts/CampaignContext';
import SessionCard from '../components/SessionCard';

const SessionsPage: React.FC = () => {
  const { sessions, createSession } = useCampaign();
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateSession = async () => {
    setIsCreating(true);
    try {
      await createSession();
    } finally {
      setIsCreating(false);
    }
  };

  const connectedSessions = sessions.filter(s => s.status === 'connected');
  const disconnectedSessions = sessions.filter(s => s.status === 'disconnected');
  const otherSessions = sessions.filter(s => !['connected', 'disconnected'].includes(s.status));

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-black mb-2">WhatsApp Sessions</h1>
            <p className="text-black">Manage your WhatsApp connections and sessions</p>
          </div>
          <button
            onClick={handleCreateSession}
            disabled={isCreating || sessions.length >= 3}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {isCreating ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            <span>Add Connection</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{sessions.length}</p>
              <p className="text-sm text-black">Total Sessions</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <Wifi className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{connectedSessions.length}</p>
              <p className="text-sm text-black">Connected</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
              <WifiOff className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{disconnectedSessions.length}</p>
              <p className="text-sm text-black">Disconnected</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{otherSessions.length}</p>
              <p className="text-sm text-black">Pending</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sessions List */}
      {sessions.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Smartphone className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-black mb-2">No WhatsApp Sessions</h3>
          <p className="text-gray-600 mb-6">Create your first WhatsApp session to start sending campaigns</p>
          <button
            onClick={handleCreateSession}
            disabled={isCreating}
            className="inline-flex items-center space-x-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            {isCreating ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
            <span>Add Your First Connection</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={{
                id: session.id,
                status: session.status,
                phoneNumber: session.phoneNumber,
                groups: session.groups || [],
                lastActivity: session.lastActivity,
                qrCode: session.qrCode
              }}
            />
          ))}
        </div>
      )}

      {/* Session Limit Warning */}
      {sessions.length >= 3 && (
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-yellow-600 rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-semibold text-yellow-800">Session Limit Reached</h4>
              <p className="text-sm text-yellow-700">You have reached the maximum of 3 WhatsApp sessions. Delete an existing session to add a new one.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionsPage;