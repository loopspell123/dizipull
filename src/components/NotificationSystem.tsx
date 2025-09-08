import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

interface NotificationSystemProps {
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    message: string;
    timestamp: Date;
    duration?: number;
  }>;
  onClose: (id: string) => void;
}

const NotificationSystem: React.FC<NotificationSystemProps> = ({ notifications, onClose }) => {
  // Auto-remove notifications after their duration
  useEffect(() => {
    const timers: { [key: string]: NodeJS.Timeout } = {};

    notifications.forEach(notification => {
      if (notification.duration && notification.duration > 0) {
        timers[notification.id] = setTimeout(() => {
          onClose(notification.id);
        }, notification.duration);
      }
    });

    // Cleanup timers when component unmounts or notifications change
    return () => {
      Object.values(timers).forEach(timer => clearTimeout(timer));
    };
  }, [notifications, onClose]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-900/20 border-green-700 text-green-100';
      case 'error':
        return 'bg-red-900/20 border-red-700 text-red-100';
      case 'warning':
        return 'bg-yellow-900/20 border-yellow-700 text-yellow-100';
      default:
        return 'bg-blue-900/20 border-blue-700 text-blue-100';
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            max-w-sm w-full p-4 rounded-lg border shadow-lg pointer-events-auto
            ${getNotificationColor(notification.type)}
            animate-fade-in
          `}
        >
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {getNotificationIcon(notification.type)}
            </div>
            <div className="ml-3 w-0 flex-1">
              {notification.title && (
                <p className="text-sm font-medium mb-1">
                  {notification.title}
                </p>
              )}
              <p className="text-sm opacity-90">
                {notification.message}
              </p>
            </div>
            <div className="ml-4 flex-shrink-0 flex">
              <button
                className="bg-transparent rounded-md inline-flex text-gray-400 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                onClick={() => onClose(notification.id)}
              >
                <span className="sr-only">Close</span>
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationSystem;