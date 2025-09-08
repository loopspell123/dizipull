import mongoose from 'mongoose';

// Get MongoDB URI from environment with better error handling
const getMongoDBURI = () => {
  if (process.env.MONGODB_URI) {
    console.log('✓ Using MONGODB_URI from environment');
    // Validate URI format
    if (!process.env.MONGODB_URI.includes('mongodb')) {
      throw new Error('Invalid MONGODB_URI format. Must start with mongodb:// or mongodb+srv://');
    }
    return process.env.MONGODB_URI;
  }
  
  // Updated fallback URI to match your Atlas cluster
  const defaultURI = 'mongodb+srv://boltuser:boltuser@cluster0.c511gzk.mongodb.net/whatsapp-campaign-dev?retryWrites=true&w=majority&appName=Cluster0&connectTimeoutMS=30000&socketTimeoutMS=30000&serverSelectionTimeoutMS=30000';
  console.log('⚠️  MONGODB_URI not found, using default Atlas URI');
  return defaultURI;
};

export const connectDatabase = async () => {
  try {
    const mongoURI = getMongoDBURI();
    console.log('🔗 Connecting to MongoDB...');
    console.log('📍 Database:', mongoURI.includes('mongodb+srv') ? 'MongoDB Atlas' : 'Local MongoDB');
    console.log('🏢 Cluster:', mongoURI.includes('cluster0.c511gzk') ? 'cluster0.c511gzk' : 'Custom');
    
    // Set mongoose options for better timeout handling (removed deprecated options)
    mongoose.set('bufferCommands', false);
    
    const connectionOptions = {
      // Connection timeout settings
      serverSelectionTimeoutMS: 30000, // 30 seconds to select a server
      connectTimeoutMS: 30000, // 30 seconds to establish connection
      socketTimeoutMS: 45000, // 45 seconds for socket operations
      
      // Connection pool settings
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 1, // Minimum number of connections
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      
      // Retry settings
      retryWrites: true,
      retryReads: true,
      
      // Other settings
      heartbeatFrequencyMS: 10000, // Check connection every 10 seconds
      family: 4, // Use IPv4, skip IPv6
    };

    await mongoose.connect(mongoURI, connectionOptions);

    console.log('✅ MongoDB connected successfully');
    console.log('📦 Database:', mongoose.connection.db.databaseName);
    console.log('🏷️  Connection State:', mongoose.connection.readyState); // 1 = connected
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });

    mongoose.connection.on('timeout', () => {
      console.error('⏰ MongoDB connection timeout');
    });

    mongoose.connection.on('close', () => {
      console.log('📪 MongoDB connection closed');
    });

    // Test the connection with a simple query
    const adminDb = mongoose.connection.db.admin();
    const pingResult = await adminDb.ping();
    console.log('🏓 MongoDB ping successful:', pingResult);

  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    // Provide helpful error messages based on error type
    if (error.message.includes('buffering timed out')) {
      console.error('🔑 Connection timeout. Please check:');
      console.error('   - Your internet connection');
      console.error('   - MongoDB Atlas cluster is running');
      console.error('   - Your IP is whitelisted (0.0.0.0/0 is set ✓)');
      console.error('   - Credentials: boltuser / boltuser');
    } else if (error.message.includes('bad auth') || error.message.includes('Authentication failed')) {
      console.error('🔑 Authentication failed. Please check:');
      console.error('   - Username: boltuser');
      console.error('   - Password: boltuser');
      console.error('   - The database user exists in MongoDB Atlas');
      console.error('   - The user has proper read/write permissions');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.error('🌐 Network connection failed. Please check:');
      console.error('   - Your internet connection');
      console.error('   - The cluster hostname: cluster0.c511gzk.mongodb.net');
      console.error('   - Your firewall settings');
    }
    
    throw error;
  }
};

export const disconnectDatabase = async () => {
  try {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error);
  }
};

// Add a connection health check function
export const checkDatabaseHealth = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }
    
    const adminDb = mongoose.connection.db.admin();
    await adminDb.ping();
    return { status: 'healthy', timestamp: new Date() };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date() 
    };
  }
};