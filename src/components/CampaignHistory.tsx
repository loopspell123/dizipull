import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Calendar,
  Search,
  Filter,
  Trash2,
  Eye
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

const CampaignHistory: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchCampaigns = async (pageNum = 1, append = false) => {
    try {
      const token = localStorage.getItem('whatsapp_auth_token');
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '20'
      });
      
      if (statusFilter) params.append('status', statusFilter);

      const response = await fetch(
        `${config.API_BASE_URL}/api/campaigns/history?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        if (append) {
          setCampaigns(prev => [...prev, ...data.campaigns]);
        } else {
          setCampaigns(data.campaigns);
        }
        
        setHasMore(data.campaigns.length === 20);
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [statusFilter]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchCampaigns(nextPage, true);
  };

  const cleanupOldCampaigns = async () => {
    if (!confirm('This will delete all campaigns older than 7 days. Are you sure?')) {
      return;
    }

    try {
      const token = localStorage.getItem('whatsapp_auth_token');
      const response = await fetch(`${config.API_BASE_URL}/api/campaigns/cleanup`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Deleted ${data.deletedCount} old campaigns`);
        fetchCampaigns();
      }
    } catch (error) {
      console.error('Failed to cleanup campaigns:', error);
      alert('Failed to cleanup old campaigns');
    }
  };

  const getStatusIcon = (status: Campaign['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-400 animate-pulse" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-orange-400" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
    }
  };

  const getStatusColor = (status: Campaign['status']) => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-900/20 border-green-700';
      case 'failed': return 'text-red-400 bg-red-900/20 border-red-700';
      case 'in_progress': return 'text-blue-400 bg-blue-900/20 border-blue-700';
      case 'cancelled': return 'text-orange-400 bg-orange-900/20 border-orange-700';
      default: return 'text-yellow-400 bg-yellow-900/20 border-yellow-700';
    }
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return 'N/A';
    const seconds = Math.floor(duration / 1000);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
        <span className="ml-3 text-gray-400">Loading campaign history...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Campaign History</h2>
            <p className="text-gray-400">
              View and manage your past campaigns. Campaigns auto-delete after 7 days.
            </p>
          </div>
          <button
            onClick={cleanupOldCampaigns}
            className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            <span>Cleanup Old</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search campaigns..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="in_progress">In Progress</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Campaigns List */}
      {filteredCampaigns.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="h-16 w-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No campaigns found</h3>
          <p className="text-gray-500">Start creating campaigns to see them here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCampaigns.map((campaign) => (
            <div key={campaign._id} className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {getStatusIcon(campaign.status)}
                    <h3 className="text-lg font-semibold text-white">{campaign.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded-lg border ${getStatusColor(campaign.status)}`}>
                      {campaign.status.toUpperCase()}
                    </span>
                  </div>
                  
                  <p className="text-gray-300 mb-3 line-clamp-2">
                    {campaign.message.length > 100 
                      ? `${campaign.message.substring(0, 100)}...` 
                      : campaign.message
                    }
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Total Groups:</span>
                      <span className="ml-2 text-white font-medium">{campaign.totalGroups}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Successful:</span>
                      <span className="ml-2 text-green-400 font-medium">{campaign.successCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Failed:</span>
                      <span className="ml-2 text-red-400 font-medium">{campaign.failedCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Duration:</span>
                      <span className="ml-2 text-white font-medium">{formatDuration(campaign.duration)}</span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-gray-500">
                    Started: {new Date(campaign.startedAt).toLocaleString()}
                    {campaign.completedAt && (
                      <span className="ml-4">
                        Completed: {new Date(campaign.completedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedCampaign(campaign)}
                  className="ml-4 p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <Eye className="h-5 w-5" />
                </button>
              </div>

              {/* Progress Bar */}
              {campaign.status === 'in_progress' && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{campaign.successCount + campaign.failedCount}/{campaign.totalGroups}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${((campaign.successCount + campaign.failedCount) / campaign.totalGroups) * 100}%` 
                      }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Load More Button */}
          {hasMore && (
            <div className="text-center">
              <button
                onClick={loadMore}
                className="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg text-white transition-colors"
              >
                Load More Campaigns
              </button>
            </div>
          )}
        </div>
      )}

      {/* Campaign Details Modal */}
      {selectedCampaign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">{selectedCampaign.name}</h3>
                <button
                  onClick={() => setSelectedCampaign(null)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-white mb-2">Campaign Details</h4>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-gray-400">Status:</span> <span className="text-white">{selectedCampaign.status}</span></div>
                    <div><span className="text-gray-400">Total Groups:</span> <span className="text-white">{selectedCampaign.totalGroups}</span></div>
                    <div><span className="text-gray-400">Success Rate:</span> <span className="text-green-400">{((selectedCampaign.successCount / selectedCampaign.totalGroups) * 100).toFixed(1)}%</span></div>
                    <div><span className="text-gray-400">Duration:</span> <span className="text-white">{formatDuration(selectedCampaign.duration)}</span></div>
                  </div>
                  
                  <h4 className="font-semibold text-white mt-4 mb-2">Message</h4>
                  <div className="bg-gray-900 p-3 rounded text-sm text-gray-300">
                    {selectedCampaign.message}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold text-white mb-2">Results ({selectedCampaign.results?.length || 0})</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedCampaign.results?.map((result, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-900 p-2 rounded text-sm">
                        <div>
                          <div className="text-white">{result.groupName}</div>
                          {result.error && <div className="text-red-400 text-xs">{result.error}</div>}
                        </div>
                        {result.success ? (
                          <CheckCircle className="h-4 w-4 text-green-400" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignHistory;
