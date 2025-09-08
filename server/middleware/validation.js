export const validateLogin = (req, res, next) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({
      error: 'Username and password are required'
    });
  }
  
  if (username.length < 3) {
    return res.status(400).json({
      error: 'Username must be at least 3 characters'
    });
  }
  
  if (password.length < 6) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters'
    });
  }
  
  next();
};

export const validateSessionId = (req, res, next) => {
  const { sessionId } = req.params;
  
  if (!sessionId || !/^session_\d+/.test(sessionId)) {
    return res.status(400).json({
      error: 'Valid session ID is required'
    });
  }
  
  next();
};