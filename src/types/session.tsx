export interface WhatsAppGroup {
  id: string;
  name: string;
  participantCount: number;
  unreadCount?: number;
  lastActivity?: Date;
  isSelected: boolean;
  description?: string;
  isArchived?: boolean;
}

export interface WhatsAppSession {
  id: string;
  sessionId?: string; // Backend compatibility
  name: string;
  phoneNumber?: string;
  status: 'initializing' | 'qr_generated' | 'authenticated' | 'connected' | 'disconnected' | 'error';
  qrCode?: string;
  groups: WhatsAppGroup[];
  whatsappConnected: boolean;
  webConnected: boolean;
  messagesSent?: number;
  lastActivity?: Date;
  errorMessage?: string;
}

export interface SessionData {
  sessionId: string;
  groups: string[];
}