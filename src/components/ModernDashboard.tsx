import React, { useState } from 'react';
import { 
  TrendingUp, 
  Users, 
  MessageCircle, 
  Activity,
  Plus,
  ArrowUp,
  ArrowDown,
  History
} from 'lucide-react';
import ModernLayout from './ModernLayout';
import { Phone } from 'lucide-react';
import SessionsPage from '../pages/SessionsPage';
import GroupsPage from '../pages/GroupsPage';
import CampaignsPage from '../pages/CampaignsPage';
import NumbersPage from '../pages/NumbersPage';
import ProductsPage from '../pages/ProductsPage';
import CampaignHistoryPage from './CampaignHistoryPage';
import { useCampaign } from '../contexts/CampaignContext';

interface User {
  id: string;
  username: string;
  email: string;
  lastLogin?: string;
  settings?: any;
}

interface ModernDashboardProps {
  user: User;
  onLogout: () => void;
}

const ModernDashboard: React.FC<ModernDashboardProps> = ({ user, onLogout }) => {
  const [currentPage, setCurrentPage] = useState('settings');
  const { sessions, getTotalSelectedGroups } = useCampaign();

  const connectedSessions = sessions.filter(s => s.status === 'connected');
  const totalGroups = sessions.reduce((total, session) => total + session.groups.length, 0);
  const selectedGroups = getTotalSelectedGroups();

  // Dashboard stats
  const stats = [
    {
      title: 'Active Sessions',
      value: connectedSessions.length,
      change: '+12%',
      changeType: 'positive' as const,
      icon: Activity,
      color: 'green'
    },
    {
      title: 'Total Groups',
      value: totalGroups,
      change: '+5%',
      changeType: 'positive' as const,
      icon: Users,
      color: 'blue'
    },
    {
      title: 'Selected Groups',
      value: selectedGroups,
      change: selectedGroups > 0 ? '+100%' : '0%',
      changeType: selectedGroups > 0 ? 'positive' : 'neutral' as const,
      icon: MessageCircle,
      color: 'purple'
    },
    {
      title: 'Campaigns Today',
      value: 0,
      change: '0%',
      changeType: 'neutral' as const,
      icon: TrendingUp,
      color: 'orange'
    }
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'settings':
        return <DashboardHome stats={stats} />;
      case 'sessions':
        return <SessionsPage />;
      case 'groups':
        return <GroupsPage />;
      case 'campaigns':
        return <CampaignsPage />;
      case 'numbers':
        return <NumbersPage />;
      case 'history':
        return <CampaignHistoryPage />;
      case 'products':
        return <ProductsPage />;
      default:
        return <DashboardHome stats={stats} />;
    }
  };
  return (
    <ModernLayout 
      currentPage={currentPage} 
      onPageChange={setCurrentPage}
      user={user}
      onLogout={onLogout}
    >
      {renderPage()}
    </ModernLayout>
  );
};

// Dashboard Home Component
const DashboardHome: React.FC<{ stats: any[] }> = ({ stats }) => {
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-blue-700 rounded-3xl p-8 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white to-green-100 bg-clip-text text-transparent">
              Welcome to Dashboard
            </h1>
            <p className="text-green-100 text-lg font-medium">
              Manage your WhatsApp campaigns, track performance, and grow your business - all in one place.
            </p>
          </div>
          <div className="hidden lg:block">
            <button className="bg-white/20 backdrop-blur-sm border border-white/30 text-white px-8 py-4 rounded-2xl font-semibold hover:bg-white hover:text-emerald-600 transition-all duration-200 shadow-lg hover:shadow-xl">
              Create Campaign
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          const isPositive = stat.changeType === 'positive';
          const isNegative = stat.changeType === 'negative';
          
          // Modern consistent color scheme
          const colorSchemes: Record<string, any> = {
            green: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', iconBg: 'bg-emerald-100' },
            blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', iconBg: 'bg-blue-100' },
            purple: { bg: 'bg-violet-50', border: 'border-violet-200', icon: 'text-violet-600', iconBg: 'bg-violet-100' },
            orange: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600', iconBg: 'bg-amber-100' }
          };
          
          const colors = colorSchemes[stat.color as string] || colorSchemes.blue;
          
          return (
            <div key={index} className={`${colors.bg} rounded-2xl p-6 border ${colors.border} hover:shadow-lg transition-all duration-200 hover:-translate-y-1`}>
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl ${colors.iconBg} shadow-sm`}>
                  <Icon className={`h-6 w-6 ${colors.icon}`} />
                </div>
                <div className={`flex items-center text-sm font-semibold ${
                  isPositive ? 'text-emerald-600' :
                  isNegative ? 'text-red-500' :
                  'text-gray-500'
                }`}>
                  {isPositive && <ArrowUp className="h-4 w-4 mr-1" />}
                  {isNegative && <ArrowDown className="h-4 w-4 mr-1" />}
                  {stat.change}
                </div>
              </div>
              
              <div>
                <h3 className="text-3xl font-bold text-gray-900 mb-2">{stat.value}</h3>
                <p className="text-gray-600 text-sm font-medium">{stat.title}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button className="group flex items-center p-6 bg-gradient-to-br from-emerald-50 to-green-50 hover:from-emerald-100 hover:to-green-100 rounded-2xl border border-emerald-200 transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
            <div className="p-3 bg-emerald-600 rounded-xl mr-4 shadow-lg group-hover:shadow-xl transition-shadow">
              <Plus className="h-6 w-6 text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-emerald-900 text-lg">New Campaign</h3>
              <p className="text-sm text-emerald-700 mt-1">Create a new WhatsApp campaign</p>
            </div>
          </button>
          
          <button className="group flex items-center p-6 bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 rounded-2xl border border-blue-200 transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
            <div className="p-3 bg-blue-600 rounded-xl mr-4 shadow-lg group-hover:shadow-xl transition-shadow">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-blue-900 text-lg">Add Session</h3>
              <p className="text-sm text-blue-700 mt-1">Connect a WhatsApp account</p>
            </div>
          </button>
          
          <button className="group flex items-center p-6 bg-gradient-to-br from-violet-50 to-purple-50 hover:from-violet-100 hover:to-purple-100 rounded-2xl border border-violet-200 transition-all duration-200 hover:shadow-lg hover:-translate-y-1">
            <div className="p-3 bg-violet-600 rounded-xl mr-4 shadow-lg group-hover:shadow-xl transition-shadow">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-violet-900 text-lg">Manage Groups</h3>
              <p className="text-sm text-violet-700 mt-1">Select target groups</p>
            </div>
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Recent Activity</h2>
        <div className="space-y-4">
          <div className="flex items-center p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
            <div className="w-3 h-3 bg-emerald-500 rounded-full mr-4 shadow-sm"></div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">New session connected</p>
              <p className="text-xs text-emerald-600">2 minutes ago</p>
            </div>
          </div>
          <div className="flex items-center p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
            <div className="w-3 h-3 bg-blue-500 rounded-full mr-4 shadow-sm"></div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Campaign created</p>
              <p className="text-xs text-blue-600">15 minutes ago</p>
            </div>
          </div>
          <div className="flex items-center p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-100">
            <div className="w-3 h-3 bg-violet-500 rounded-full mr-4 shadow-sm"></div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Groups updated</p>
              <p className="text-xs text-violet-600">1 hour ago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernDashboard;
