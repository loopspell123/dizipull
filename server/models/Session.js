import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phoneNumber: { type: String },
  status: { 
    type: String, 
    enum: ['initializing', 'waiting_scan', 'authenticated', 'connected', 'disconnected', 'error'],
    default: 'initializing'
  },
  persistent: { type: Boolean, default: true },
  groups: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    participantCount: { type: Number, default: 0 },
    lastActivity: { 
      type: Date, 
      default: Date.now,
      validate: {
        validator: function(v) {
          return v instanceof Date && !isNaN(v);
        },
        message: 'lastActivity must be a valid date'
      }
    },
    unreadCount: { type: Number, default: 0 },
    description: { type: String, default: '' },
    isSelected: { type: Boolean, default: false }
  }],
  clientInfo: {
    platform: String,
    pushName: String,
    battery: Number
  },
  messagesSent: { type: Number, default: 0 },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Add pre-save middleware to validate dates
sessionSchema.pre('save', function(next) {
  // Validate all group lastActivity dates
  if (this.groups) {
    this.groups.forEach(group => {
      if (!group.lastActivity || isNaN(group.lastActivity)) {
        group.lastActivity = new Date();
      }
    });
  }
  
  // Validate main lastActivity
  if (!this.lastActivity || isNaN(this.lastActivity)) {
    this.lastActivity = new Date();
  }
  
  next();
});

// Add pre-update middleware to validate dates
sessionSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  
  // Validate groups array if being updated
  if (update.groups && Array.isArray(update.groups)) {
    update.groups = update.groups.map(group => {
      if (!group.lastActivity || isNaN(new Date(group.lastActivity))) {
        group.lastActivity = new Date();
      }
      return group;
    });
  }
  
  // Always update the updatedAt field
  update.updatedAt = new Date();
  
  next();
});

sessionSchema.index({ userId: 1, sessionId: 1 });
sessionSchema.index({ userId: 1, status: 1 });

export default mongoose.model('Session', sessionSchema);