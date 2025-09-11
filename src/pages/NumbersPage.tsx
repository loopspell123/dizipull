import React, { useState, useEffect } from 'react';
import { Upload, Download, Phone, Users, Trash2, Send, FileSpreadsheet, Plus, Clock, Play, Pause, BarChart3, Settings, AlertCircle, CheckCircle, XCircle, Edit2, StopCircle } from 'lucide-react';
import { useCampaign } from '../contexts/CampaignContext';

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Contact {
  id: string;
  name: string;
  number: string;
  selected: boolean;
}

interface CampaignStatus {
  campaignId: string;
  name: string;
  status: string;
  totalContacts: number;
  stats: {
    sent: number;
    failed: number;
    pending: number;
  };
  createdAt: string;
  completedAt?: string;
}

const NumbersPage: React.FC = () => {
  const { sessions } = useCampaign();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [activeCampaigns, setActiveCampaigns] = useState<CampaignStatus[]>([]);
  
  // Advanced settings
  const [delay, setDelay] = useState(6); // seconds
  const [batchSize, setBatchSize] = useState(1000);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isServerConnected, setIsServerConnected] = useState(false);

  const connectedSessions = sessions.filter(s => s.status === 'connected');
  const selectedContacts = contacts.filter(c => c.selected);

  // Check server connection on component mount
  useEffect(() => {
    checkServerConnection();
    const interval = setInterval(checkServerConnection, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const checkServerConnection = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        setIsServerConnected(true);
        console.log('Server connection: OK');
      } else {
        setIsServerConnected(false);
        console.warn('Server connection: Failed');
      }
    } catch (error) {
      setIsServerConnected(false);
      console.error('Server connection check failed:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      parseExcelFile(file);
    }
  };

  const parseExcelFile = async (file: File) => {
    if (!isServerConnected) {
      alert('Server is not connected. Please check if the backend server is running on ' + API_BASE_URL);
      return;
    }

    setIsUploading(true);
    setUploadStatus('Uploading file...');
    
    try {
      console.log('Uploading file:', file.name, file.type, file.size);
      
      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
      ];
      
      if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
        throw new Error('Please upload a valid Excel or CSV file');
      }

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('excel', file);

      setUploadStatus('Processing file...');

      const apiUrl = `${API_BASE_URL}/api/contacts/upload`;
      
      console.log('Making API call to:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('whatsapp_auth_token')}`
        },
        body: formData
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        let errorText = 'Unknown error';
        try {
          errorText = await response.text();
        } catch (e) {
          console.error('Could not read error response:', e);
        }
        console.error('Server responded with error:', response.status, errorText);
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      let data;
      try {
        const responseText = await response.text();
        console.log('Raw response:', responseText);
        data = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError);
        throw new Error('Invalid JSON response from server');
      }
      
      console.log('Server response:', data);
      
      if (data.success && data.contacts) {
        const parsedContacts = data.contacts.map((contact: any, index: number) => ({
          id: `contact_${Date.now()}_${index}`,
          name: contact.name || `Contact ${index + 1}`,
          number: contact.number,
          selected: false
        }));
        
        setContacts(parsedContacts);
        setUploadStatus(`Successfully loaded ${parsedContacts.length} contacts`);
        console.log(`Successfully loaded ${parsedContacts.length} contacts`);
        
        if (parsedContacts.length === 0) {
          setUploadStatus('No valid contacts found in file');
          alert('No valid contacts found. Please check your Excel file format.\n\nExpected columns: Name, Number (or Phone/Mobile/WhatsApp)');
        }
      } else {
        console.error('Server error:', data);
        setUploadStatus('Failed to process file');
        alert(`Error: ${data.error || 'Unknown error'}\n\n${data.details || ''}\n\n${data.suggestion || 'Please check your file format'}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setUploadStatus(`Upload failed: ${errorMessage}`);
      
      if (errorMessage.includes('Failed to fetch')) {
        alert(`Connection failed!\n\nPlease check:\n1. Is your backend server running on ${API_BASE_URL}?\n2. Check your network connection\n3. Verify CORS settings\n\nError: ${errorMessage}`);
      } else {
        alert(`Upload failed: ${errorMessage}\n\nPlease try again or check the file format.`);
      }
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadStatus(''), 5000);
    }
  };

  const toggleContactSelection = (id: string) => {
    setContacts(prev => prev.map(contact => 
      contact.id === id ? { ...contact, selected: !contact.selected } : contact
    ));
  };

  const toggleAllContacts = () => {
    const allSelected = contacts.every(c => c.selected);
    setContacts(prev => prev.map(contact => ({ ...contact, selected: !allSelected })));
  };

  const removeContact = (id: string) => {
    setContacts(prev => prev.filter(contact => contact.id !== id));
  };

  const addManualContact = () => {
    const name = prompt('Enter contact name:');
    const number = prompt('Enter phone number (with country code, e.g., +919876543210):');
    
    if (name && number) {
      // Clean the number
      let cleanNumber = number.replace(/[^\d+]/g, '');
      
      // Add +91 if only 10 digits
      if (cleanNumber.length === 10 && !cleanNumber.startsWith('+')) {
        cleanNumber = '+91' + cleanNumber;
      }
      
      if (cleanNumber.length >= 10 && cleanNumber.length <= 16) {
        const newContact: Contact = {
          id: `manual_${Date.now()}`,
          name,
          number: cleanNumber,
          selected: false
        };
        setContacts(prev => [...prev, newContact]);
      } else {
        alert('Please enter a valid phone number (10-15 digits with country code)');
      }
    }
  };

  const sendMessages = async () => {
    if (!isServerConnected) {
      alert('Server is not connected. Please check if the backend server is running.');
      return;
    }

    if (!selectedSession || !message || selectedContacts.length === 0) {
      alert('Please select a session, enter a message, and select contacts');
      return;
    }

    // Confirm before sending
    const estimatedTime = Math.ceil((selectedContacts.length * delay) / 60);
    const batchCount = Math.ceil(selectedContacts.length / batchSize);
    
    const confirmMessage = `
Campaign Details:
• ${selectedContacts.length} contacts
• ${batchCount} batches of ${batchSize} contacts
• ${delay} seconds delay between messages  
• Estimated time: ${estimatedTime} minutes
• 10 minutes break between batches

Continue?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/contacts/send-to-numbers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('whatsapp_auth_token')}`
        },
        body: JSON.stringify({
          sessionId: selectedSession,
          contacts: selectedContacts.map(c => ({
            name: c.name,
            number: c.number
          })),
          message: message,
          delay: delay * 1000, // Convert to milliseconds
          batchSize: parseInt(String(batchSize)),
          campaignName: campaignName || `Campaign ${new Date().toLocaleDateString()}`
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (data.success) {
        alert(`Campaign started successfully!\n\nCampaign ID: ${data.campaignId}\nEstimated time: ${data.estimatedTime}`);
        setMessage('');
        setCampaignName('');
        setContacts(prev => prev.map(c => ({ ...c, selected: false })));
        
        // Refresh campaigns
        fetchActiveCampaigns();
      } else {
        alert(`Error: ${data.error || 'Unknown error'}\n\n${data.details || ''}`);
      }
    } catch (error) {
      console.error('Error sending messages:', error);
      alert(`Error sending messages: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSending(false);
    }
  };

  const fetchActiveCampaigns = async () => {
    if (!isServerConnected) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/contacts/campaigns?limit=10`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('whatsapp_auth_token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setActiveCampaigns(data.campaigns || []);
        }
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    }
  };

  useEffect(() => {
    if (isServerConnected) {
      fetchActiveCampaigns();
      // Refresh campaigns every 30 seconds
      const interval = setInterval(fetchActiveCampaigns, 30000);
      return () => clearInterval(interval);
    }
  }, [isServerConnected]);

  const calculateEstimatedTime = () => {
    if (selectedContacts.length === 0) return 0;
    const totalTime = selectedContacts.length * delay;
    const batches = Math.ceil(selectedContacts.length / batchSize);
    const batchBreaks = (batches - 1) * 10 * 60; // 10 minutes between batches
    return Math.ceil((totalTime + batchBreaks) / 60);
  };

  const formatCampaignStatus = (status: string) => {
    const statusMap = {
      'queued': { icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
      'running': { icon: Play, color: 'text-blue-600', bg: 'bg-blue-50' },
      'paused': { icon: Pause, color: 'text-orange-600', bg: 'bg-orange-50' },
      'completed': { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
      'failed': { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' }
    };

    const config = statusMap[status as keyof typeof statusMap] || statusMap.queued;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.color} ${config.bg}`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const handleCampaignAction = async (campaignId: string, action: 'pause' | 'resume' | 'delete') => {
    try {
      let response;
      
      if (action === 'delete') {
        if (!confirm('Are you sure you want to delete this campaign? This will also delete all message logs.')) {
          return;
        }
        response = await fetch(`${API_BASE_URL}/api/contacts/campaign/${campaignId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('whatsapp_auth_token')}`
          }
        });
      } else {
        response = await fetch(`${API_BASE_URL}/api/contacts/campaign/${campaignId}/pause`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('whatsapp_auth_token')}`
          }
        });
      }

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          alert(action === 'delete' ? 'Campaign deleted successfully' : data.message);
          fetchActiveCampaigns(); // Refresh campaigns
        }
      } else {
        throw new Error('Failed to perform action');
      }
    } catch (error) {
      console.error(`Error performing ${action}:`, error);
      alert(`Failed to ${action} campaign`);
    }
  };

  return (
    <div className="p-6">
      {/* Header with Connection Status */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-black mb-2">Direct Number Messaging</h1>
            <p className="text-gray-600">Upload Excel sheets and send messages directly to phone numbers</p>
          </div>
          <div className="flex items-center space-x-2">
            {isServerConnected ? (
              <div className="flex items-center text-green-600">
                <CheckCircle className="w-4 h-4 mr-1" />
                <span className="text-sm">Server Connected</span>
              </div>
            ) : (
              <div className="flex items-center text-red-600">
                <XCircle className="w-4 h-4 mr-1" />
                <span className="text-sm">Server Disconnected</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connection Warning */}
      {!isServerConnected && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <div>
              <h3 className="text-red-800 font-medium">Backend Server Not Connected</h3>
              <p className="text-red-700 text-sm mt-1">
                Please ensure your backend server is running on <code className="bg-red-100 px-1 rounded">{API_BASE_URL}</code>
              </p>
              <p className="text-red-700 text-sm">
                Run: <code className="bg-red-100 px-1 rounded">cd server && npm start</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{contacts.length}</p>
              <p className="text-sm text-black">Total Numbers</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{selectedContacts.length}</p>
              <p className="text-sm text-black">Selected</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{selectedFile ? '1' : '0'}</p>
              <p className="text-sm text-black">Excel Files</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{connectedSessions.length}</p>
              <p className="text-sm text-black">Active Sessions</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-black">{calculateEstimatedTime()}</p>
              <p className="text-sm text-black">Est. Minutes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Campaigns */}
      {activeCampaigns.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-black mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2" />
            Recent Campaigns (Last 10)
          </h2>
          <div className="space-y-3">
            {activeCampaigns.map((campaign) => (
              <div key={campaign.campaignId} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h3 className="font-medium text-black">{campaign.name}</h3>
                    {formatCampaignStatus(campaign.status)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {campaign.totalContacts} contacts • {campaign.stats?.sent || 0} sent • {campaign.stats?.failed || 0} failed
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Created: {new Date(campaign.createdAt).toLocaleString()}
                    {campaign.completedAt && (
                      <span className="ml-2">
                        • Completed: {new Date(campaign.completedAt).toLocaleString()}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {(campaign.status === 'running' || campaign.status === 'paused') && (
                    <button
                      onClick={() => handleCampaignAction(campaign.campaignId, campaign.status === 'running' ? 'pause' : 'resume')}
                      className={`p-2 rounded-lg text-white ${
                        campaign.status === 'running' 
                          ? 'bg-orange-600 hover:bg-orange-700' 
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                      title={campaign.status === 'running' ? 'Pause Campaign' : 'Resume Campaign'}
                    >
                      {campaign.status === 'running' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => handleCampaignAction(campaign.campaignId, 'delete')}
                    className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    title="Delete Campaign"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-black mb-4">Upload Contacts</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Excel File (.xlsx, .xls, .csv)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="block w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-black focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={isUploading || !isServerConnected}
            />
            {uploadStatus && (
              <div className={`mt-2 text-sm ${
                uploadStatus.includes('failed') || uploadStatus.includes('Failed') 
                  ? 'text-red-600' 
                  : uploadStatus.includes('Successfully') || uploadStatus.includes('loaded')
                  ? 'text-green-600' 
                  : 'text-blue-600'
              }`}>
                {uploadStatus}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={addManualContact}
              disabled={!isServerConnected}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Manual</span>
            </button>
            <a
              href={`${API_BASE_URL}/public/template.xlsx`}
              download
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Template</span>
            </a>
          </div>
        </div>
        {isUploading && (
          <div className="mt-4 text-blue-600">
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span>Processing Excel file...</span>
            </div>
          </div>
        )}
      </div>

      {/* Campaign Settings */}
      {contacts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-black">Campaign Settings</h2>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center space-x-2 px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              <Settings className="w-4 h-4" />
              <span>{showAdvanced ? 'Hide' : 'Show'} Advanced</span>
            </button>
          </div>

          {/* Campaign Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Campaign Name (Optional)
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g., Holiday Sale Campaign, New Product Launch"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-black focus:ring-2 focus:ring-blue-500"
              disabled={!isServerConnected}
            />
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Delay Between Messages (seconds)
                </label>
                <input
                  type="number"
                  min="3"
                  max="60"
                  value={delay}
                  onChange={(e) => setDelay(parseInt(e.target.value) || 6)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-black focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Minimum 3 seconds to avoid spam detection</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Batch Size (contacts per batch)
                </label>
                <select
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-black focus:ring-2 focus:ring-blue-500"
                >
                  <option value={500}>500 contacts</option>
                  <option value={1000}>1000 contacts</option>
                  <option value={1500}>1500 contacts</option>
                  <option value={2000}>2000 contacts</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">10 minutes break between batches</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estimated Campaign Time
                </label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-100">
                  <div className="text-lg font-semibold text-black">{calculateEstimatedTime()} minutes</div>
                  <div className="text-xs text-gray-500">
                    {Math.ceil(selectedContacts.length / batchSize)} batches
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Session Selection and Send */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select WhatsApp Session</label>
              <select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-black focus:ring-2 focus:ring-blue-500"
                disabled={!isServerConnected}
              >
                <option value="">Choose a WhatsApp session...</option>
                {connectedSessions.map(session => (
                  <option key={session.id} value={session.id}>
                    {session.id.slice(-8)} - Connected
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={sendMessages}
                disabled={!selectedSession || !message || selectedContacts.length === 0 || isSending || !isServerConnected}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isSending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Starting Campaign...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send to {selectedContacts.length} numbers</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Message Composition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Content
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-black focus:ring-2 focus:ring-blue-500"
              placeholder="Enter your message here..."
              disabled={!isServerConnected}
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{message.length} characters</span>
              <span>WhatsApp message limit: 4096 characters</span>
            </div>
          </div>
        </div>
      )}

      {/* Safety Guidelines */}
      {selectedContacts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-800 mb-2">Anti-Ban Safety Features</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• {delay} second delay between each message</li>
            <li>• {Math.ceil(selectedContacts.length / batchSize)} batches with 10-minute breaks</li>
            <li>• Numbers automatically formatted for India (+91)</li>
            <li>• Campaign tracking for monitoring</li>
            <li>• Automatic retry for failed messages</li>
          </ul>
        </div>
      )}

      {/* Contacts Table */}
      {contacts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black">Contacts ({contacts.length})</h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleAllContacts}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                {contacts.every(c => c.selected) ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={contacts.length > 0 && contacts.every(c => c.selected)}
                      onChange={toggleAllContacts}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {contacts.map((contact) => (
                  <tr key={contact.id} className={contact.selected ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={contact.selected}
                        onChange={() => toggleContactSelection(contact.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-black">{contact.name}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-black font-mono">{contact.number}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => removeContact(contact.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Remove contact"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* Empty State */}
      {contacts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-black mb-2">No contacts uploaded</h3>
          <p className="text-gray-600 mb-4">Upload an Excel file or add contacts manually to get started.</p>
          <div className="text-sm text-gray-500 mt-4 max-w-md mx-auto">
            <p className="font-semibold">Expected Excel format:</p>
            <div className="mt-2 text-left">
              <p>Column headers can be:</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li><strong>Name:</strong> Name, name, NAME, Contact, ContactName</li>
                <li><strong>Number:</strong> Number, Phone, Mobile, WhatsApp, Cell</li>
              </ul>
              <div className="mt-3 p-3 bg-gray-100 rounded text-xs">
                <p className="font-medium mb-1">Number format examples:</p>
                <p>+919876543210 (with country code)</p>
                <p>9876543210 (will auto-add +91)</p>
                <p>+1234567890 (international numbers)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Information  we want*/}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 bg-gray-100 border border-gray-300 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-2">Debug Information</h3>
          <div className="text-sm text-gray-700 space-y-1">
            <p><strong>API Base URL:</strong> {API_BASE_URL}</p>
            <p><strong>Server Status:</strong> {isServerConnected ? 'Connected' : 'Disconnected'}</p>
            <p><strong>Selected Contacts:</strong> {selectedContacts.length}</p>
            <p><strong>Selected Session:</strong> {selectedSession || 'None'}</p>
            <p><strong>Connected Sessions:</strong> {connectedSessions.length}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default NumbersPage;