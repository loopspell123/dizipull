import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log(`🔐 Login attempt for: ${username}`);

    // Add timeout wrapper for database query
    const user = await Promise.race([
      User.findOne({
        $or: [
          { username: username.toLowerCase() },
          { email: username.toLowerCase() }
        ],
        isActive: true
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout after 15 seconds')), 15000)
      )
    ]);

    if (!user) {
      console.log(`❌ User not found: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log(`❌ Invalid password for: ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login with timeout
    try {
      user.lastLogin = new Date();
      await Promise.race([
        user.save(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('User update timeout')), 10000)
        )
      ]);
    } catch (updateError) {
      console.warn('⚠️  Could not update last login:', updateError.message);
      // Continue with login even if update fails
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✅ Login successful for: ${username}`);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        lastLogin: user.lastLogin,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    
    // Provide specific error messages based on error type
    if (error.message.includes('timeout')) {
      return res.status(503).json({ 
        error: 'Database connection timeout. Please try again.',
        code: 'DB_TIMEOUT'
      });
    } else if (error.message.includes('buffering timed out')) {
      return res.status(503).json({ 
        error: 'Database is temporarily unavailable. Please try again.',
        code: 'DB_UNAVAILABLE'
      });
    }
    
    res.status(500).json({ 
      error: 'Login service temporarily unavailable. Please try again.',
      code: 'SERVICE_ERROR'
    });
  }
};

export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Add timeout wrapper for existing user check
    const existingUser = await Promise.race([
      User.findOne({
        $or: [
          { username: username.toLowerCase() },
          { email: email.toLowerCase() }
        ]
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), 15000)
      )
    ]);

    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      settings: {
        bulkMessageDelay: 10000,
        maxRetries: 3,
        autoReconnect: true
      }
    });

    // Add timeout wrapper for user creation
    await Promise.race([
      user.save(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('User creation timeout')), 15000)
      )
    ]);

    res.status(201).json({
      success: true,
      message: 'User created successfully'
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    
    if (error.message.includes('timeout')) {
      return res.status(503).json({ 
        error: 'Database connection timeout. Please try again.',
        code: 'DB_TIMEOUT'
      });
    }
    
    res.status(500).json({ 
      error: 'Registration service temporarily unavailable. Please try again.',
      code: 'SERVICE_ERROR'
    });
  }
};

// Add a health check function for auth
export const validateToken = async (req, res) => {
  try {
    // req.user is set by authenticateToken middleware
    res.json({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        lastLogin: req.user.lastLogin,
        settings: req.user.settings
      }
    });
  } catch (error) {
    console.error('❌ Token validation error:', error);
    res.status(500).json({ error: 'Token validation failed' });
  }
};