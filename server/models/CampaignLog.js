import mongoose from 'mongoose';

const campaignLogSchema = new mongoose.Schema({
  campaignId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true },
  name: { type: String, required: true },
  message: { type: String, required: true },
  mediaId: { type: String },
  groupIds: [{ type: String }],
  totalGroups: { type: Number, required: true },
  successCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['started', 'in_progress', 'completed', 'failed', 'cancelled'], 
    default: 'started' 
  },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  duration: { type: Number }, // in milliseconds
  results: [{
    groupId: { type: String, required: true },
    groupName: { type: String, required: true },
    success: { type: Boolean, required: true },
    error: { type: String },
    messageId: { type: String },
    sentAt: { type: Date, default: Date.now }
  }]
});

// Auto-delete campaigns older than 7 days
campaignLogSchema.index({ startedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

// Index for user queries
campaignLogSchema.index({ userId: 1, startedAt: -1 });

export default mongoose.model('CampaignLog', campaignLogSchema);
