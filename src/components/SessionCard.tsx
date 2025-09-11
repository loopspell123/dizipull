import React from 'react';
import { 
  Smartphone, 
  Wifi, 
  WifiOff, 
  Users, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Trash2,
  Zap,
  LogOut,
  MoreVertical,
  QrCode
} from 'lucide-react';
import { WhatsAppSession, useCampaign } from '../contexts/CampaignContext';
import QRCodeDisplay from './QRCodeDisplay';

interface SessionCardProps {
  session: WhatsAppSession;
}

const SessionCard: React.FC<SessionCardProps> = ({ session }) => {
  const { disconnectSession, deleteSession, forceReady, logoutSession } = useCampaign();

  const getStatusIcon = () => {
    switch (session.status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'authenticated':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'waiting_scan':
        return <QrCode className="h-4 w-4 text-amber-500" />;
      case 'initializing':
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'auth_failure':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <WifiOff className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (session.status) {
      case 'connected':
        return 'Connected';
      case 'authenticated':
        return 'Authenticated (loading...)';
      case 'waiting_scan':
        return 'Waiting for QR scan';
      case 'initializing':
        return 'Initializing...';
      case 'auth_failure':
        return 'Authentication failed';
      default:
        return 'Disconnected';
    }
  };

  const getStatusColor = () => {
    switch (session.status) {
      case 'connected':
        return 'text-green-400';
      case 'waiting_scan':
        return 'text-amber-400';
      case 'initializing':
        return 'text-blue-400';
      case 'auth_failure':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const selectedGroups = session.groups.filter(g => g.isSelected).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-200">
      {/* Card Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <div className="flex items-center space-x-4">
          <div className={`p-3 rounded-xl shadow-sm ${
            session.status === 'connected' ? 'bg-emerald-100 border border-emerald-200' :
            session.status === 'waiting_scan' ? 'bg-amber-100 border border-amber-200' :
            session.status === 'auth_failure' ? 'bg-red-100 border border-red-200' :
            'bg-gray-100 border border-gray-200'
          }`}>
            <Smartphone className={`h-6 w-6 ${
              session.status === 'connected' ? 'text-emerald-600' :
              session.status === 'waiting_scan' ? 'text-amber-600' :
              session.status === 'auth_failure' ? 'text-red-600' :
              'text-gray-600'
            }`} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-base">
              {session.phoneNumber || `Account ${session.id.replace('session_', '')}`}
            </h3>
            <div className="flex items-center space-x-2 text-sm">
              {getStatusIcon()}
              <span className={`font-semibold ${getStatusColor()}`}>
                {getStatusText()}
              </span>
            </div>
          </div>
        </div>
        
        {/* Actions Dropdown */}
        <div className="relative group">
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            <MoreVertical className="h-5 w-5" />
          </button>
          
          {/* Dropdown Menu */}
          <div className="absolute right-0 top-10 w-52 bg-white rounded-2xl shadow-xl border border-gray-200 py-2 z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
            {session.status === 'authenticated' && (
              <button
                onClick={() => forceReady(session.id)}
                className="w-full flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-yellow-50 hover:to-amber-50 transition-all duration-200"
              >
                <Zap className="h-5 w-5 mr-3 text-yellow-500" />
                <span className="font-medium">Force Ready</span>
              </button>
            )}
            {(session.status === 'connected' || session.status === 'authenticated') && (
              <button
                onClick={() => logoutSession(session.id)}
                className="w-full flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-orange-50 hover:to-red-50 transition-all duration-200"
              >
                <LogOut className="h-5 w-5 mr-3 text-orange-500" />
                <span className="font-medium">Logout</span>
              </button>
            )}
            <button
              onClick={() => deleteSession(session.id)}
              className="w-full flex items-center px-4 py-3 text-sm text-red-600 hover:bg-gradient-to-r hover:from-red-50 hover:to-rose-50 transition-all duration-200"
            >
              <Trash2 className="h-5 w-5 mr-3" />
              <span className="font-medium">Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Card Content */}
      <div className="p-6">
        {/* QR Code Section */}
        {(session.status === 'waiting_scan' || session.status === 'initializing') && session.qrCode && (
          <div className="text-center py-8">
            <div className="bg-gradient-to-br from-gray-50 to-white p-6 rounded-2xl border-2 border-dashed border-gray-300 inline-block shadow-sm">
              <img src={session.qrCode} alt="WhatsApp QR Code" className="max-w-48 max-h-48 mx-auto rounded-xl" />
            </div>
            <p className="text-sm text-gray-600 mt-4 font-medium">
              Scan QR code with WhatsApp mobile app
            </p>
          </div>
        )}

        {/* Status-based Content */}
        {session.status === 'authenticated' && (
          <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 border border-blue-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center space-x-3 mb-3">
              <CheckCircle className="h-6 w-6 text-blue-600" />
              <span className="text-lg font-bold text-blue-900">Authenticated</span>
            </div>
            <p className="text-sm text-blue-700 mb-2">Waiting for WhatsApp to fully initialize...</p>
            <p className="text-xs text-blue-600 font-medium">If groups don't load, try the ⚡ button</p>
          </div>
        )}

        {session.status === 'connected' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-emerald-50 via-green-50 to-emerald-100 border border-emerald-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center space-x-3 mb-3">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
                <span className="text-lg font-bold text-emerald-900">Connected & Ready</span>
              </div>
              {session.phoneNumber && (
                <p className="text-sm text-emerald-700 font-mono bg-emerald-100 px-3 py-2 rounded-lg inline-block">
                  +{session.phoneNumber}
                </p>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-4 border border-gray-200 text-center shadow-sm">
                <Users className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-600 font-medium">Total Groups</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{session.groups?.length || 0}</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-2xl p-4 border border-emerald-200 text-center shadow-sm">
                <CheckCircle className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
                <p className="text-xs text-emerald-700 font-medium">Selected</p>
                <p className="text-2xl font-bold text-emerald-900 mt-1">{selectedGroups}</p>
              </div>
            </div>
          </div>
        )}

        {session.status === 'initializing' && (
          <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-8 text-center border border-gray-200 shadow-sm">
            <div className="animate-spin h-10 w-10 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-700 text-base font-medium">Setting up WhatsApp connection...</p>
          </div>
        )}

        {session.status === 'auth_failure' && (
          <div className="bg-gradient-to-br from-red-50 via-rose-50 to-red-100 border border-red-200 rounded-2xl p-6 text-center shadow-sm">
            <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-3" />
            <p className="text-base font-bold text-red-800 mb-2">Authentication Failed</p>
            <p className="text-sm text-red-700">Please try connecting again</p>
          </div>
        )}

        {!['waiting_scan', 'initializing', 'authenticated', 'connected', 'auth_failure'].includes(session.status) && (
          <div className="bg-gradient-to-br from-gray-50 to-white rounded-2xl p-6 text-center border border-gray-200 shadow-sm">
            <WifiOff className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <p className="text-base text-gray-600 font-medium">Not connected</p>
          </div>
        )}

        {/* Last Activity */}
        {session.lastActivity && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-500 font-medium">
              Last activity: {session.lastActivity.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionCard;