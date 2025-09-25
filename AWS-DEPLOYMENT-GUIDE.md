# 🚀 AWS EC2 Deployment Guide for WhatsApp Campaign Manager

## 📋 **Prerequisites**
- AWS Account
- Domain: digicart.in (configured with your domain registrar)
- Your project ready with production environment files

## 💰 **Cost Breakdown (Monthly)**
| Service | Instance Type | Cost | Note |
|---------|---------------|------|------|
| **EC2** | t3.micro | **FREE** (first year) then $8.5/month | Recommended for start |
| **EC2** | t3.small | $16.8/month | Better performance |
| **Elastic IP** | | **FREE** (when attached) | Static IP for domain |
| **Storage** | 20GB EBS | $2/month | |
| **Data Transfer** | 1GB/month | **FREE** | |
| **Total** | | **$2-18/month** | Very affordable! |

---

## 🎯 **Step 1: Create AWS EC2 Instance**

### 1.1 Launch EC2 Instance
```bash
# 1. Go to AWS Console → EC2 → Launch Instance
# 2. Choose these settings:

Name: whatsapp-campaign-server
AMI: Ubuntu Server 22.04 LTS (Free tier eligible)
Instance type: t3.micro (Free tier) or t3.small (better performance)
Key pair: Create new key pair → Download .pem file
Security Group: Create new with these rules:
  - SSH (22): Your IP only
  - HTTP (80): Anywhere
  - HTTPS (443): Anywhere  
  - Custom (3001): Anywhere (for your app)
Storage: 20 GB gp3 (Free tier eligible)
```

### 1.2 Connect to Your Instance
```bash
# Windows (use PowerShell or Git Bash)
ssh -i "your-key.pem" ubuntu@your-ec2-ip

# If permission error on Windows:
icacls "your-key.pem" /inheritance:r /grant:r "%username%:(R)"
```

---

## 🔧 **Step 2: Server Setup**

### 2.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 Install Node.js 18+
```bash
# Install Node.js via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 2.3 Install Dependencies
```bash
# Install required packages
sudo apt install -y git chromium-browser nginx certbot python3-certbot-nginx pm2 -g

# Set Chrome path for WhatsApp Web automation
which chromium-browser  # Note this path for .env
```

### 2.4 Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
```

---

## 📦 **Step 3: Deploy Your Application**

### 3.1 Upload Your Project
```bash
# Option 1: Using Git (recommended)
git clone https://github.com/yourusername/whatsapp-campaign-manager.git
cd whatsapp-campaign-manager

# Option 2: Using SCP (from your local machine)
scp -i "your-key.pem" -r "E:\project-bolt-sb1-kxclnghj\New work placce with arrgemnt\whatsapp-campaign-manager" ubuntu@your-ec2-ip:~/
```

### 3.2 Setup Production Environment
```bash
cd whatsapp-campaign-manager

# Copy production environment files
cp .env.production .env
cp src/.env.production src/.env

# IMPORTANT: Edit production secrets
nano .env
```

**Update these critical values in .env:**
```bash
# Generate secure secrets
JWT_SECRET=REPLACE_WITH_STRONG_SECRET_64_CHARS
SESSION_SECRET=REPLACE_WITH_STRONG_SECRET_32_CHARS
DEFAULT_ADMIN_PASSWORD=YourSecurePassword123!

# Update Chrome path (from step 2.3)
CHROME_PATH=/usr/bin/chromium-browser

# Update URLs (we'll set the IP first, then domain later)
CLIENT_URL=http://YOUR_ELASTIC_IP
CLIENT_URL_PROD=http://YOUR_ELASTIC_IP
API_BASE_URL=http://YOUR_ELASTIC_IP
```

### 3.3 Install Dependencies & Build
```bash
# Install backend dependencies
npm install --production

# Install frontend dependencies and build
cd src
npm install
npm run build
cd ..

# The built frontend is now in dist/ directory
```

---

## 🎬 **Step 4: Start Application with PM2**

### 4.1 Create PM2 Ecosystem File
```bash
nano ecosystem.config.js
```

**Add this configuration:**
```javascript
module.exports = {
  apps: [{
    name: 'whatsapp-campaign-manager',
    script: 'server/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log'
  }]
};
```

### 4.2 Create Logs Directory & Start App
```bash
mkdir logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4.3 Verify Application is Running
```bash
pm2 status
pm2 logs

# Test the app
curl http://localhost:3001/health
```

---

## 🌐 **Step 5: Setup Nginx Reverse Proxy**

### 5.1 Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/whatsapp-campaign
```

**Add this configuration:**
```nginx
server {
    listen 80;
    server_name YOUR_ELASTIC_IP digicart.in www.digicart.in;

    # Serve built frontend files
    location / {
        root /home/ubuntu/whatsapp-campaign-manager/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy Socket.IO connections
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5.2 Enable Site & Restart Nginx
```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-campaign /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🔒 **Step 6: Get Elastic IP & SSL Certificate**

### 6.1 Allocate Elastic IP
```bash
# In AWS Console:
# 1. Go to EC2 → Network & Security → Elastic IPs
# 2. Click "Allocate Elastic IP address"
# 3. Click "Allocate"
# 4. Select the new IP → Actions → Associate Elastic IP address
# 5. Choose your instance → Associate

# Note down your Elastic IP (e.g., 3.15.123.45)
```

### 6.2 Update Environment with Elastic IP
```bash
nano .env
# Update these with your Elastic IP:
CLIENT_URL=http://3.15.123.45
CLIENT_URL_PROD=http://3.15.123.45
API_BASE_URL=http://3.15.123.45

nano src/.env
# Update:
VITE_API_URL=http://3.15.123.45/api
VITE_WS_URL=http://3.15.123.45
VITE_SOCKET_URL=http://3.15.123.45

# Rebuild frontend
cd src && npm run build && cd ..

# Restart application
pm2 restart whatsapp-campaign-manager
```

### 6.3 Test with Elastic IP
```bash
# Test your app at: http://YOUR_ELASTIC_IP
curl http://YOUR_ELASTIC_IP/health
```

---

## 📡 **Step 7: Configure DNS for digicart.in**

### 7.1 Point Domain to AWS Server
Go to your domain registrar (where you bought digicart.in) and add these DNS records:

```
Type: A Record
Name: @ (root domain)
Value: YOUR_ELASTIC_IP (e.g., 3.15.123.45)
TTL: 300

Type: A Record  
Name: www
Value: YOUR_ELASTIC_IP (e.g., 3.15.123.45)
TTL: 300
```

### 7.2 Wait for DNS Propagation (5-60 minutes)
```bash
# Check if domain is resolving:
nslookup digicart.in
ping digicart.in
```

### 7.3 Update Environment for Domain
```bash
nano .env
# Update URLs to use domain:
CLIENT_URL=https://digicart.in
CLIENT_URL_PROD=https://digicart.in
API_BASE_URL=https://digicart.in

nano src/.env
# Update:
VITE_API_URL=https://digicart.in/api
VITE_WS_URL=https://digicart.in
VITE_SOCKET_URL=https://digicart.in

# Rebuild and restart
cd src && npm run build && cd ..
pm2 restart whatsapp-campaign-manager
```

---

## 🔒 **Step 8: Setup SSL Certificate (HTTPS)**

### 8.1 Get Free SSL Certificate
```bash
# Install SSL certificate using Let's Encrypt
sudo certbot --nginx -d digicart.in -d www.digicart.in

# Follow prompts:
# Email: your-email@example.com
# Agree to terms: Y
# Share email: N (optional)
# Redirect HTTP to HTTPS: 2 (Yes)
```

### 8.2 Auto-renewal Setup
```bash
# Test renewal
sudo certbot renew --dry-run

# Certbot automatically sets up cron job for renewal
```

---

## ✅ **Step 9: Final Testing**

### 9.1 Test Your Application
```bash
# Your app should now be live at:
https://digicart.in

# Test all endpoints:
curl https://digicart.in/health
curl https://digicart.in/api/auth

# Check PM2 status
pm2 status
pm2 logs
```

### 9.2 Verify WhatsApp Web.js
- Go to https://digicart.in
- Login with admin credentials
- Create a WhatsApp session
- Scan QR code with your phone

---

## 🎉 **Deployment Complete!**

Your WhatsApp Campaign Manager is now live at:
- **Main URL**: https://digicart.in
- **Admin Panel**: https://digicart.in (login with your admin credentials)
- **API Endpoint**: https://digicart.in/api
- **Health Check**: https://digicart.in/health

## 📊 **Monitoring Commands**
```bash
# Check app status
pm2 status

# View logs
pm2 logs whatsapp-campaign-manager

# Restart app
pm2 restart whatsapp-campaign-manager

# Check nginx status
sudo systemctl status nginx

# Check SSL certificate
sudo certbot certificates
```

## 💰 **Monthly AWS Costs**
- **EC2 t3.micro**: FREE (first year) then $8.5/month
- **Elastic IP**: FREE (when attached to running instance)
- **Storage (20GB)**: $2/month
- **Total**: **$2/month** (first year), **$10.5/month** (after)

**Congratulations! Your WhatsApp Campaign Manager is now deployed on AWS and accessible via digicart.in!** 🚀