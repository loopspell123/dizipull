# 🚀 Deployment Guide for WhatsApp Campaign Manager

## 📁 Environment Files Overview

Your project now has organized environment configurations for different deployment scenarios:

```
Project Structure:
├── .env                     # Currently active environment
├── .env.development         # Backend development settings
├── .env.staging            # Backend staging settings
├── .env.production         # Backend production settings (digicart.in)
├── src/
│   ├── .env                # Currently active frontend environment
│   ├── .env.development    # Frontend development settings
│   ├── .env.staging       # Frontend staging settings
│   └── .env.production    # Frontend production settings (digicart.in)
└── server/
    └── .env.example       # Template for server configuration
```

## 🌍 Environment Types

### 1. **Local Development**
- **Files to use**: `.env.development` (both root and src/)
- **Domain**: `http://localhost:5173` and `http://localhost:3001`
- **Database**: Development database
- **Debug**: Enabled

### 2. **Staging/Testing**
- **Files to use**: `.env.staging` (both root and src/)
- **Domain**: `https://staging.digicart.in`
- **Database**: Staging database
- **Debug**: Enabled for testing

### 3. **Production (digicart.in)**
- **Files to use**: `.env.production` (both root and src/)
- **Domain**: `https://digicart.in`
- **Database**: Production database
- **Debug**: Disabled

## 🔄 How to Switch Environments

### Option 1: Copy Environment Files
```bash
# For Production Deployment to digicart.in
cp .env.production .env
cp src/.env.production src/.env

# For Staging Deployment
cp .env.staging .env
cp src/.env.staging src/.env

# For Local Development
cp .env.development .env
cp src/.env.development src/.env
```

### Option 2: Use Environment-Specific Commands
Update your `package.json` scripts:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development npm run server",
    "build": "NODE_ENV=production vite build",
    "build:staging": "NODE_ENV=staging vite build",
    "start:prod": "NODE_ENV=production node server/index.js",
    "start:staging": "NODE_ENV=staging node server/index.js"
  }
}
```

## 🌐 Deployment Steps for digicart.in

### Step 1: Prepare Production Environment
```bash
# 1. Copy production environment files
cp .env.production .env
cp src/.env.production src/.env

# 2. Update secrets (IMPORTANT!)
# Edit .env and change:
# - JWT_SECRET to a strong random value
# - SESSION_SECRET to a strong random value  
# - DEFAULT_ADMIN_PASSWORD to a secure password
```

### Step 2: Build for Production
```bash
# 1. Install dependencies
npm install --production

# 2. Build frontend (from src directory)
cd src
npm run build

# 3. The built files will be in ../dist directory
```

### Step 3: Deploy to Server
```bash
# 1. Upload your project to digicart.in server
# 2. Set environment variables on your server
# 3. Start the application
npm start
```

## ⚙️ Server Environment Variables

When deploying to digicart.in, ensure these environment variables are set on your server:

### Required Variables
```bash
NODE_ENV=production
PORT=3001
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-session-secret
CLIENT_URL=https://digicart.in
```

### Optional but Recommended
```bash
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_EMAIL=admin@digicart.in  
DEFAULT_ADMIN_PASSWORD=your-secure-password
CHROME_PATH=/usr/bin/google-chrome
DEBUG=false
LOG_LEVEL=error
```

## 🔐 Security Checklist for Production

- [ ] Change `JWT_SECRET` to a random 64+ character string
- [ ] Change `SESSION_SECRET` to a random 64+ character string
- [ ] Update `DEFAULT_ADMIN_PASSWORD` to a strong password
- [ ] Verify `CLIENT_URL` points to `https://digicart.in`
- [ ] Set `NODE_ENV=production`
- [ ] Disable debug logging (`DEBUG=false`)
- [ ] Ensure HTTPS is enabled on digicart.in
- [ ] Configure proper CORS origins

## 🚦 Quick Commands

```bash
# Local Development
npm run dev

# Build for Production
npm run build

# Start Production Server
npm start

# Check Environment
echo $NODE_ENV
```

## 🌐 Domain Configuration

### Development
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

### Staging
- Frontend: `https://staging.digicart.in`
- Backend: `https://staging.digicart.in`

### Production
- Frontend: `https://digicart.in`
- Backend: `https://digicart.in`

## 🔧 Troubleshooting

1. **Frontend not connecting to backend**: Check `VITE_API_URL` in frontend .env
2. **CORS errors**: Verify `CLIENT_URL` in backend .env matches frontend domain
3. **Database connection issues**: Check `MONGODB_URI` format
4. **WhatsApp not working**: Ensure `CHROME_PATH` is correct on production server

Remember to keep your production secrets secure and never commit them to version control!