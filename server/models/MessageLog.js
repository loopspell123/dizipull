import mongoose from 'mongoose';

const messageLogSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Group messaging fields (optional for direct number campaigns)
  groupId: { type: String, required: false }, // Changed from required: true
  groupName: { type: String },
  
  // Direct number messaging fields
  campaignId: { type: String }, // For tracking campaigns
  recipientType: { type: String, enum: ['group', 'number'], default: 'group' },
  recipientId: { type: String }, // Phone number for direct messaging
  recipientName: { type: String }, // Contact name for direct messaging
  
  // Common fields
  message: { type: String, required: true },
  mediaPath: { type: String },
  messageId: { type: String },
  status: { type: String, enum: ['sent', 'failed', 'pending'], required: true },
  error: { type: String },
  retryCount: { type: Number, default: 0 },
  sentAt: { type: Date, default: Date.now }
});

// Indexes for better query performance
messageLogSchema.index({ sessionId: 1, sentAt: -1 });
messageLogSchema.index({ campaignId: 1, sentAt: -1 });
messageLogSchema.index({ userId: 1, sentAt: -1 });

// Validation: Either groupId or recipientId must be provided
messageLogSchema.pre('validate', function(next) {
  if (!this.groupId && !this.recipientId) {
    this.invalidate('groupId', 'Either groupId or recipientId must be provided');
    this.invalidate('recipientId', 'Either groupId or recipientId must be provided');
  }
  next();
});

export default mongoose.model('MessageLog', messageLogSchema);