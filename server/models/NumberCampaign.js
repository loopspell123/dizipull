import mongoose from 'mongoose';

const numberCampaignSchema = new mongoose.Schema({
  campaignId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  contacts: [{
    name: String,
    number: String
  }],
  totalContacts: {
    type: Number,
    required: true
  },
  sentCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  batchSize: {
    type: Number,
    default: 1000
  },
  delay: {
    type: Number,
    default: 6000
  },
  scheduleType: {
    type: String,
    enum: ['immediate', 'scheduled'],
    default: 'immediate'
  },
  status: {
    type: String,
    enum: ['queued', 'running', 'paused', 'completed', 'failed'],
    default: 'queued'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  lastProcessedAt: {
    type: Date
  },
  currentBatch: {
    type: Number,
    default: 0
  },
  totalBatches: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String
  }
}, {
  timestamps: true
});

// Add indexes for better performance
numberCampaignSchema.index({ userId: 1, createdAt: -1 });
numberCampaignSchema.index({ status: 1, createdAt: -1 });
numberCampaignSchema.index({ sessionId: 1, status: 1 });

const NumberCampaign = mongoose.model('NumberCampaign', numberCampaignSchema);

export default NumberCampaign;