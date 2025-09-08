import cors from 'cors';

// Production domains
const PRODUCTION_DOMAINS = [
  'https://digihub-frontend.onrender.com',
  'https://digihub-backend-axps.onrender.com',
];

// Development domains
const DEVELOPMENT_DOMAINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// Get allowed origins based on environment
const getAllowedOrigins = () => {
  const customOrigins = [
    process.env.CLIENT_URL,
    process.env.CLIENT_URL_PROD,
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  if (process.env.NODE_ENV === 'production') {
    return [...PRODUCTION_DOMAINS, ...customOrigins];
  }
  
  return [...DEVELOPMENT_DOMAINS, ...PRODUCTION_DOMAINS, ...customOrigins];
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Reduce logging - only log once per session or on failures
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.some(allowed => {
      if (allowed === origin) return true;
      // Allow subdomain matching for production
      if (origin.includes('.onrender.com') && allowed.includes('.onrender.com')) return true;
      return false;
    })) {
      return callback(null, true);
    }

    // In development, be more permissive
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
    }

    // Only log blocked origins
    console.log('❌ CORS: Origin blocked -', origin);
    console.log('   Allowed origins:', allowedOrigins);
    
    const error = new Error(`CORS: Origin ${origin} not allowed`);
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
};

export default cors(corsOptions);