import React from 'react';
import { 
  Smartphone, 
  Users, 
  Send, 
  History, 
  Package,
  Settings,
  LogOut,
  User
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: 'sessions' | 'groups' | 'campaigns' | 'campaign-history' | 'products') => void;
  user: any;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, user, onLogout }) => {
  const menuItems = [
    { id: 'sessions' as const, label: 'WhatsApp Sessions', icon: Smartphone },
    { id: 'groups' as const, label: 'Groups', icon: Users },
    { id: 'campaigns' as const, label: 'Campaigns', icon: Send },
    { id: 'campaign-history' as const, label: 'Campaign History', icon: History },
    { id: 'products' as const, label: 'Products', icon: Package },
  ];

  return (
    <div className="w-64 h-screen bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Logo/Brand */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">WA Promo</h1>
            <p className="text-sm text-gray-400">Campaign Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  isActive 
                    ? 'bg-green-600 text-white' 
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* User Profile & Settings */}
      <div className="p-4 border-t border-gray-700 space-y-2">
        <button className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700 hover:text-white rounded-lg transition-colors">
          <Settings className="w-5 h-5" />
          <span className="font-medium">Settings</span>
        </button>
        
        {/* User Info */}
        <div className="flex items-center space-x-3 px-4 py-3 bg-gray-700 rounded-lg">
          <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-gray-300" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">{user?.username || 'Admin'}</p>
            <p className="text-xs text-gray-400">{user?.email || 'admin@example.com'}</p>
          </div>
          <button
            onClick={onLogout}
            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;