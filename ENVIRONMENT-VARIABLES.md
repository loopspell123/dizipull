# 🔧 Environment Variables Reference

## 📋 Complete List of Environment Variables

### 🖥️ **Backend Variables** (Root .env files)

| Variable | Description | Development | Staging | Production | Required |
|----------|-------------|-------------|---------|------------|----------|
| `NODE_ENV` | Application environment | `development` | `staging` | `production` | ✅ |
| `PORT` | Server port | `3001` | `3001` | `3001` | ✅ |
| `CLIENT_URL` | Frontend URL for CORS | `http://localhost:5173` | `https://staging.digicart.in` | `https://digicart.in` | ✅ |
| `CLIENT_URL_PROD` | Production frontend URL | `http://localhost:5173` | `https://staging.digicart.in` | `https://digicart.in` | ✅ |
| `API_BASE_URL` | Backend API URL | `http://localhost:3001` | `https://staging.digicart.in` | `https://digicart.in` | ✅ |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...dev` | `mongodb+srv://...staging` | `mongodb+srv://...prod` | ✅ |
| `JWT_SECRET` | JWT token secret | `dev-jwt-key` | `staging-jwt-key` | `CHANGE-THIS-STRONG-SECRET` | ✅ |
| `SESSION_SECRET` | Session secret | `dev-session-secret` | `staging-session-secret` | `CHANGE-THIS-STRONG-SECRET` | ✅ |
| `BCRYPT_ROUNDS` | Password hashing rounds | `8` | `10` | `12` | ❌ |
| `DEFAULT_ADMIN_USERNAME` | Initial admin username | `admin` | `staging-admin` | `admin` | ❌ |
| `DEFAULT_ADMIN_EMAIL` | Initial admin email | `admin@example.com` | `admin@staging.digicart.in` | `admin@digicart.in` | ❌ |
| `DEFAULT_ADMIN_PASSWORD` | Initial admin password | `admin123` | `staging-admin-123` | `CHANGE-THIS-PASSWORD` | ❌ |
| `MAX_FILE_SIZE` | Max upload file size (bytes) | `52428800` | `52428800` | `52428800` | ❌ |
| `UPLOAD_PATH` | File upload directory | `uploads` | `uploads` | `uploads` | ❌ |
| `CHROME_PATH` | Chrome executable path | (auto) | `/usr/bin/google-chrome` | `/usr/bin/google-chrome` | ❌ |
| `WS_HOST` | WebSocket host | `0.0.0.0` | `0.0.0.0` | `0.0.0.0` | ❌ |
| `WS_PORT` | WebSocket port | `8081` | `8081` | `8081` | ❌ |
| `DEBUG` | Enable debug logging | `true` | `true` | `false` | ❌ |
| `LOG_LEVEL` | Logging level | `debug` | `info` | `error` | ❌ |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:5173` | `https://staging.digicart.in` | `https://digicart.in` | ❌ |

### 🎨 **Frontend Variables** (src/.env files)

| Variable | Description | Development | Staging | Production | Required |
|----------|-------------|-------------|---------|------------|----------|
| `VITE_APP_NAME` | Application name | `WhatsApp Campaign Manager` | `WhatsApp Campaign Manager (Staging)` | `WhatsApp Campaign Manager` | ❌ |
| `VITE_NODE_ENV` | Frontend environment | `development` | `staging` | `production` | ❌ |
| `VITE_API_URL` | Backend API URL | `http://localhost:3001` | `https://staging.digicart.in/api` | `https://digicart.in/api` | ✅ |
| `VITE_WS_URL` | WebSocket URL | `http://localhost:3001` | `https://staging.digicart.in` | `https://digicart.in` | ✅ |
| `VITE_SOCKET_URL` | Socket.IO URL | `http://localhost:3001` | `https://staging.digicart.in` | `https://digicart.in` | ✅ |
| `VITE_MAX_FILE_SIZE` | Max file upload size | `52428800` | `52428800` | `52428800` | ❌ |
| `VITE_ALLOWED_FILE_TYPES` | Allowed file extensions | `jpeg,jpg,png,...` | `jpeg,jpg,png,...` | `jpeg,jpg,png,...` | ❌ |
| `VITE_DEBUG` | Enable debug mode | `true` | `true` | `false` | ❌ |
| `VITE_LOG_LEVEL` | Frontend log level | `debug` | `debug` | `error` | ❌ |
| `VITE_ENABLE_ANALYTICS` | Enable analytics | `false` | `false` | `false` | ❌ |
| `VITE_ENABLE_DEBUG_PANEL` | Show debug panel | `true` | `true` | `false` | ❌ |
| `VITE_ENABLE_TEST_MODE` | Enable test features | `false` | `true` | `false` | ❌ |

## 🔐 **Security Variables** (Must Change in Production!)

### Critical Security Variables
```bash
# NEVER use these in production - CHANGE THEM!
JWT_SECRET=CHANGE-THIS-TO-SUPER-SECRET-KEY-FOR-DIGICART-PRODUCTION-2024
SESSION_SECRET=CHANGE-THIS-TO-SESSION-SECRET-FOR-DIGICART-PRODUCTION-2024
DEFAULT_ADMIN_PASSWORD=CHANGE-THIS-STRONG-PASSWORD-123
```

### How to Generate Secure Secrets
```bash
# Generate a 64-character random string for JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate a 32-character random string for SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate a strong password
node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"
```

## 🌍 **Environment-Specific Configurations**

### Local Development
```bash
# Copy these files for local development
cp .env.development .env
cp src/.env.development src/.env
```

### Staging Deployment
```bash
# Copy these files for staging
cp .env.staging .env
cp src/.env.staging src/.env
```

### Production Deployment (digicart.in)
```bash
# Copy these files for production
cp .env.production .env
cp src/.env.production src/.env

# IMPORTANT: Update security variables before deploying!
```

## 📝 **Environment File Templates**

### Backend .env Template
```bash
# Server Configuration
NODE_ENV=production
PORT=3001

# Domain Configuration
CLIENT_URL=https://digicart.in
API_BASE_URL=https://digicart.in

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# Security (CHANGE THESE!)
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-session-secret
DEFAULT_ADMIN_PASSWORD=your-secure-password

# Optional
CHROME_PATH=/usr/bin/google-chrome
DEBUG=false
LOG_LEVEL=error
```

### Frontend .env Template
```bash
# App Configuration
VITE_APP_NAME=WhatsApp Campaign Manager
VITE_NODE_ENV=production

# API Configuration
VITE_API_URL=https://digicart.in/api
VITE_WS_URL=https://digicart.in
VITE_SOCKET_URL=https://digicart.in

# Optional
VITE_DEBUG=false
VITE_LOG_LEVEL=error
```

## 🚨 **Important Notes**

1. **Never commit production secrets** to version control
2. **Always change default passwords** in production
3. **Use strong random secrets** for JWT and sessions
4. **Verify domain URLs** match your actual domain
5. **Test in staging** before deploying to production
6. **Keep backups** of your production environment files
7. **Use environment-specific databases** for each environment

## 🔄 **Quick Switch Commands**

```bash
# Switch to Development
npm run env:dev  # (if you add this script)

# Switch to Staging  
npm run env:staging  # (if you add this script)

# Switch to Production
npm run env:prod  # (if you add this script)
```

Add these to your package.json:
```json
{
  "scripts": {
    "env:dev": "cp .env.development .env && cp src/.env.development src/.env",
    "env:staging": "cp .env.staging .env && cp src/.env.staging src/.env", 
    "env:prod": "cp .env.production .env && cp src/.env.production src/.env"
  }
}
```