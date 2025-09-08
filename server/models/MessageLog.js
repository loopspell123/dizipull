import mongoose from 'mongoose';

const messageLogSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  groupId: { type: String, required: true },
  groupName: { type: String },
  message: { type: String, required: true },
  mediaPath: { type: String },
  messageId: { type: String },
  status: { type: String, enum: ['sent', 'failed', 'pending'], required: true },
  error: { type: String },
  retryCount: { type: Number, default: 0 },
  sentAt: { type: Date, default: Date.now }
});

messageLogSchema.index({ sessionId: 1, sentAt: -1 });

export default mongoose.model('MessageLog', messageLogSchema);