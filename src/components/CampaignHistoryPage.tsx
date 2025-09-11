import React, { useState, useEffect } from 'react';
import { 
  History,
  Clock,
  CheckCircle,
  XCircle,
  Users,
  MessageCircle,
  Calendar,
  Filter,
  Search,
  Eye,
  Trash2,
  Download,
  AlertTriangle,
  TrendingUp
} from 'lucide-react';
import config from '../config';

interface Campaign {
  _id: string;
  campaignId: string;
  name: string;
  message: string;
  totalGroups: number;
  successCount: number;
  failedCount: number;
  status: 'started' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  results: Array<{
    groupId: string;
    groupName: string;
    success: boolean;
    error?: string;
    messageId?: string;
    sentAt: string;
  }>;
}

interface MessageLog {
  _id: string;
  sessionId: string;
  groupId: string;
  groupName: string;
  message: string;
  status: 'sent' | 'failed' | 'pending';
  error?: string;
  sentAt: string;
  messageId?: string;
}

const CampaignHistoryPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'messages'>('campaigns');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    fetchHistoryData();
  }, [activeTab, statusFilter]);

  const fetchHistoryData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('whatsapp_auth_token');
      
      if (activeTab === 'campaigns') {
        const params = new URLSearchParams({
          page: '1',
          limit: '50',
          ...(statusFilter !== 'all' && { status: statusFilter })
        });
        
        const response = await fetch(`${config.API_BASE_URL}/api/campaigns/history?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setCampaigns(data.campaigns || []);
        }
      } else {
        const response = await fetch(`${config.API_BASE_URL}/api/messages/history?page=1&limit=100`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        }
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-600 bg-emerald-100';
      case 'in_progress': return 'text-blue-600 bg-blue-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'cancelled': return 'text-gray-600 bg-gray-100';
      case 'sent': return 'text-emerald-600 bg-emerald-100';
      case 'pending': return 'text-amber-600 bg-amber-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'sent':
        return <CheckCircle className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      case 'in_progress':
        return <Clock className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const filteredCampaigns = campaigns.filter(campaign =>
    campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    campaign.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMessages = messages.filter(message =>
    message.groupName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    message.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const CampaignCard = ({ campaign }: { campaign: Campaign }) => {
    const successRate = campaign.totalGroups > 0 ? (campaign.successCount / campaign.totalGroups) * 100 : 0;
    
    return (
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
        {/* Campaign Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl">
              <MessageCircle className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">{campaign.name}</h3>
              <p className="text-sm text-gray-500">Campaign ID: {campaign.campaignId.split('_').pop()}</p>
            </div>
          </div>
          
          <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(campaign.status)}`}>
            {getStatusIcon(campaign.status)}
            <span className="capitalize">{campaign.status}</span>
          </div>
        </div>

        {/* Campaign Stats */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <Users className="h-5 w-5 text-gray-500 mx-auto mb-1" />
            <p className="text-sm text-gray-600">Total Groups</p>
            <p className="text-lg font-bold text-gray-900">{campaign.totalGroups}</p>
          </div>
          <div className="text-center">
            <CheckCircle className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-sm text-gray-600">Success</p>
            <p className="text-lg font-bold text-emerald-600">{campaign.successCount}</p>
          </div>
          <div className="text-center">
            <XCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
            <p className="text-sm text-gray-600">Failed</p>
            <p className="text-lg font-bold text-red-600">{campaign.failedCount}</p>
          </div>
        </div>

        {/* Success Rate Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600">Success Rate</span>
            <span className="font-semibold text-gray-900">{successRate.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-emerald-500 to-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${successRate}%` }}
            ></div>
          </div>
        </div>

        {/* Campaign Info */}
        <div className="space-y-2">
          <div className="flex items-center text-sm text-gray-600">
            <Calendar className="h-4 w-4 mr-2" />
            Started: {new Date(campaign.startedAt).toLocaleString()}
          </div>
          {campaign.completedAt && (
            <div className="flex items-center text-sm text-gray-600">
              <Clock className="h-4 w-4 mr-2" />
              Duration: {campaign.duration ? formatDuration(campaign.duration) : 'N/A'}
            </div>
          )}
        </div>

        {/* Message Preview */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700 line-clamp-2">{campaign.message}</p>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mt-4">
          <button
            onClick={() => setSelectedCampaign(campaign)}
            className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            <Eye className="h-4 w-4" />
            <span>View Details</span>
          </button>
          
          <div className="flex items-center space-x-2">
            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Download className="h-4 w-4" />
            </button>
            <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const MessageCard = ({ message }: { message: MessageLog }) => (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl">
            <MessageCircle className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{message.groupName || 'Unknown Group'}</h4>
            <p className="text-sm text-gray-500">Session: {message.sessionId.split('_').pop()}</p>
          </div>
        </div>
        
        <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(message.status)}`}>
          {getStatusIcon(message.status)}
          <span className="capitalize">{message.status}</span>
        </div>
      </div>

      <div className="mb-3 p-3 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-700 line-clamp-3">{message.message}</p>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4" />
          <span>{new Date(message.sentAt).toLocaleString()}</span>
        </div>
        
        {message.error && (
          <div className="flex items-center space-x-1 text-red-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs">Error</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl">
            <History className="h-8 w-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Campaign History</h1>
            <p className="text-gray-600">Track your campaign performance and message history</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-6 py-2 rounded-xl font-medium transition-all duration-200 ${
            activeTab === 'campaigns'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Campaigns
        </button>
        <button
          onClick={() => setActiveTab('messages')}
          className={`px-6 py-2 rounded-xl font-medium transition-all duration-200 ${
            activeTab === 'messages'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Messages
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {activeTab === 'campaigns' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In Progress</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <div className="grid gap-6">
          {activeTab === 'campaigns' ? (
            filteredCampaigns.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredCampaigns.map((campaign) => (
                  <CampaignCard key={campaign._id} campaign={campaign} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No campaigns found</p>
                <p className="text-gray-500 text-sm">Start a new campaign to see it here</p>
              </div>
            )
          ) : (
            filteredMessages.length > 0 ? (
              <div className="grid gap-4">
                {filteredMessages.map((message) => (
                  <MessageCard key={message._id} message={message} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No messages found</p>
                <p className="text-gray-500 text-sm">Send messages to see them here</p>
              </div>
            )
          )}
        </div>
      )}

      {/* Campaign Details Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Campaign Details</h2>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Campaign Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <Users className="h-6 w-6 text-gray-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Total Groups</p>
                  <p className="text-xl font-bold text-gray-900">{selectedCampaign.totalGroups}</p>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-xl">
                  <CheckCircle className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm text-emerald-700">Success</p>
                  <p className="text-xl font-bold text-emerald-600">{selectedCampaign.successCount}</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-xl">
                  <XCircle className="h-6 w-6 text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-red-700">Failed</p>
                  <p className="text-xl font-bold text-red-600">{selectedCampaign.failedCount}</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <TrendingUp className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-blue-700">Success Rate</p>
                  <p className="text-xl font-bold text-blue-600">
                    {((selectedCampaign.successCount / selectedCampaign.totalGroups) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Results Table */}
              {selectedCampaign.results && selectedCampaign.results.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Detailed Results</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-900">Group Name</th>
                          <th className="px-4 py-3 text-center font-medium text-gray-900">Status</th>
                          <th className="px-4 py-3 text-center font-medium text-gray-900">Sent At</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-900">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedCampaign.results.map((result, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{result.groupName}</td>
                            <td className="px-4 py-3 text-center">
                              <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                                result.success ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                              }`}>
                                {result.success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                <span>{result.success ? 'Success' : 'Failed'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-gray-600">
                              {new Date(result.sentAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-red-600 text-xs">
                              {result.error || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignHistoryPage;
