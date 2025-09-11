import React from 'react';
import { Trash2, LogOut, RefreshCw, Wifi, WifiOff, Clock, Play } from 'lucide-react';

interface SessionCardImprovedProps {
  session: {
    id: string;
    status: string;
    phoneNumber?: string;
    groups: any[];
    lastActivity?: Date;
    qrCode?: string;
  };
  onDelete: (sessionId: string) => void;
  onLogout: (sessionId: string) => void;
  onReconnect?: (sessionId: string) => void;
  onRefresh: (sessionId: string) => void;
}

const SessionCardImproved: React.FC<SessionCardImprovedProps> = ({
  session,
  onDelete,
  onLogout,
  onReconnect,
  onRefresh
}) => {
  const getStatusInfo = () => {
    switch (session.status) {
      case 'connected':
        return {
          icon: <Wifi className="w-4 h-4 text-green-500" />,
          text: 'Connected',
          color: 'bg-green-500/20 text-green-300 border-green-500/30'
        };
      case 'qr':
      case 'waiting_scan':
        return {
          icon: <Clock className="w-4 h-4 text-yellow-500" />,
          text: 'Waiting for QR Scan',
          color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
        };
      case 'initializing':
        return {
          icon: <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />,
          text: 'Initializing...',
          color: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
        };
      case 'disconnected':
        return {
          icon: <WifiOff className="w-4 h-4 text-gray-500" />,
          text: 'Disconnected',
          color: 'bg-gray-500/20 text-gray-300 border-gray-500/30'
        };
      default:
        return {
          icon: <WifiOff className="w-4 h-4 text-red-500" />,
          text: 'Error',
          color: 'bg-red-500/20 text-red-300 border-red-500/30'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const selectedGroups = session.groups?.filter(g => g.isSelected)?.length || 0;

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to permanently DELETE this session? This will remove all data and cannot be undone.')) {
      onDelete(session.id);
    }
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to LOGOUT this session? The session will be kept but disconnected from WhatsApp. You can reconnect later.')) {
      onLogout(session.id);
    }
  };

  const handleReconnect = () => {
    if (onReconnect) {
      onReconnect(session.id);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {statusInfo.icon}
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusInfo.color}`}>
            {statusInfo.text}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {/* Reconnect button for disconnected sessions */}
          {session.status === 'disconnected' && onReconnect && (
            <button
              onClick={handleReconnect}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Reconnect Session"
            >
              <Play className="w-4 h-4 text-green-400" />
            </button>
          )}
          
          {/* Refresh groups button for connected sessions */}
          {session.status === 'connected' && (
            <button
              onClick={() => onRefresh(session.id)}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Refresh Groups"
            >
              <RefreshCw className="w-4 h-4 text-gray-400" />
            </button>
          )}
          
          {/* Logout button for connected/qr sessions */}
          {(session.status === 'connected' || session.status === 'qr' || session.status === 'waiting_scan') && (
            <button
              onClick={handleLogout}
              className="p-1 hover:bg-gray-700 rounded transition-colors"
              title="Logout (Keep session but disconnect WhatsApp)"
            >
              <LogOut className="w-4 h-4 text-yellow-400" />
            </button>
          )}
          
          {/* Delete button - always available */}
          <button
            onClick={handleDelete}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
            title="Delete Session Permanently"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Session ID:</span>
          <span className="text-gray-200 font-mono text-xs">
            {session.id.replace('session_', '').slice(0, 8)}...
          </span>
        </div>
        
        {session.phoneNumber && (
          <div className="flex justify-between">
            <span className="text-gray-400">Phone:</span>
            <span className="text-gray-200">+{session.phoneNumber}</span>
          </div>
        )}
        
        <div className="flex justify-between">
          <span className="text-gray-400">Groups:</span>
          <span className="text-gray-200">
            {session.groups?.length || 0} ({selectedGroups} selected)
          </span>
        </div>
        
        {session.lastActivity && (
          <div className="flex justify-between">
            <span className="text-gray-400">Last Activity:</span>
            <span className="text-gray-200 text-xs">
              {new Date(session.lastActivity).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Instructions for disconnected sessions */}
      {session.status === 'disconnected' && (
        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-300">
            📱 Session is disconnected. Click the reconnect button (▶️) to scan QR code again.
          </p>
        </div>
      )}

      {/* QR Code Display */}
      {session.qrCode && (session.status === 'qr' || session.status === 'waiting_scan') && (
        <div className="mt-4 p-3 bg-white rounded-lg">
          <div className="text-center mb-2">
            <p className="text-xs text-gray-600 font-medium">Scan QR Code with WhatsApp</p>
          </div>
          <img
            src={session.qrCode}
            alt="WhatsApp QR Code"
            className="w-48 h-48 mx-auto"
          />
          <div className="text-center mt-2">
            <p className="text-xs text-gray-500">
              QR Code will expire in 2 minutes
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionCardImproved;