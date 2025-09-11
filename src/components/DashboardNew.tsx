import React, { useState } from 'react';
import Sidebar from './Sidebar';
import SessionsPage from '../pages/SessionsPage';
import GroupsPage from '../pages/GroupsPage';
import CampaignsPage from '../pages/CampaignsPage';
import CampaignHistoryPage from '../pages/CampaignHistoryPage';
import ProductsPage from '../pages/ProductsPage';

interface DashboardProps {
  user?: any;
  onLogout?: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ user, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'sessions' | 'groups' | 'campaigns' | 'campaign-history' | 'products'>('sessions');

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      // Fallback logout
      localStorage.removeItem('whatsapp_auth_token');
      localStorage.removeItem('whatsapp_user');
      window.location.reload();
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'sessions':
        return <SessionsPage />;
      case 'groups':
        return <GroupsPage />;
      case 'campaigns':
        return <CampaignsPage />;
      case 'campaign-history':
        return <CampaignHistoryPage />;
      case 'products':
        return <ProductsPage />;
      default:
        return <SessionsPage />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        onLogout={handleLogout}
      />
      
      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
};

export default Dashboard;