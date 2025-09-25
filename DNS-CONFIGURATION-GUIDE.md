# 📡 DNS Configuration Guide for digicart.in

## 🎯 **Overview**
After deploying your WhatsApp Campaign Manager on AWS EC2, you need to point your domain `digicart.in` to your AWS server's IP address. This guide shows you exactly how to do that.

---

## 📋 **What You'll Need**
- ✅ Your AWS EC2 Elastic IP address (e.g., `3.15.123.45`)
- ✅ Access to your domain registrar (where you bought digicart.in)
- ✅ Your deployed application running on AWS

---

## 🔍 **Step 1: Find Your AWS Server IP**

### Get Your Elastic IP from AWS Console:
```bash
# Method 1: AWS Console
1. Go to AWS Console → EC2 → Elastic IPs
2. Find your allocated IP address
3. Copy the IP (e.g., 3.15.123.45)

# Method 2: From your EC2 instance
curl ifconfig.me
# Returns your public IP
```

---

## 🌐 **Step 2: Configure DNS Records**

### Common Domain Registrars:

#### **GoDaddy**
```
1. Go to GoDaddy → My Products → DNS
2. Find your domain: digicart.in
3. Click "DNS" or "Manage DNS"
4. Add/Edit these records:

Type: A
Name: @ (or leave empty for root domain)
Value: YOUR_ELASTIC_IP (e.g., 3.15.123.45)
TTL: 600 seconds

Type: A
Name: www
Value: YOUR_ELASTIC_IP (e.g., 3.15.123.45)  
TTL: 600 seconds
```

#### **Namecheap**
```
1. Go to Namecheap → Account → Domain List
2. Click "Manage" next to digicart.in
3. Go to "Advanced DNS" tab
4. Add/Edit these records:

Type: A Record
Host: @
Value: YOUR_ELASTIC_IP
TTL: 300

Type: A Record
Host: www
Value: YOUR_ELASTIC_IP
TTL: 300
```

#### **Cloudflare** (if using)
```
1. Go to Cloudflare Dashboard
2. Select your domain: digicart.in
3. Go to DNS → Records
4. Add these records:

Type: A
Name: @
IPv4 address: YOUR_ELASTIC_IP
Proxy status: 🟡 (DNS only) - for initial setup
TTL: Auto

Type: A
Name: www
IPv4 address: YOUR_ELASTIC_IP
Proxy status: 🟡 (DNS only)
TTL: Auto
```

#### **Route 53** (AWS DNS)
```
1. Go to AWS Console → Route 53
2. Create Hosted Zone for digicart.in
3. Add these records:

Type: A
Name: digicart.in
Value: YOUR_ELASTIC_IP
Routing Policy: Simple

Type: A
Name: www.digicart.in
Value: YOUR_ELASTIC_IP
Routing Policy: Simple

4. Update nameservers at your domain registrar with Route 53 nameservers
```

---

## ⏱️ **Step 3: DNS Propagation**

### Wait for Propagation (5-60 minutes)
```bash
# Check DNS propagation from your local machine:

# Method 1: nslookup
nslookup digicart.in
# Should return your Elastic IP

# Method 2: ping
ping digicart.in
# Should show your Elastic IP

# Method 3: Online tools
# Go to: https://dnschecker.org
# Enter: digicart.in
# Check if it resolves to your IP globally
```

### Check from Different Locations:
```bash
# Use online DNS checkers:
https://dnschecker.org
https://www.whatsmydns.net
https://dns.google/query?name=digicart.in&type=A
```

---

## 🔧 **Step 4: Update Your Application**

### Once DNS is Working:
```bash
# SSH into your AWS server
ssh -i "your-key.pem" ubuntu@your-elastic-ip

cd whatsapp-campaign-manager

# Update backend environment
nano .env
# Change from IP to domain:
CLIENT_URL=https://digicart.in
CLIENT_URL_PROD=https://digicart.in
API_BASE_URL=https://digicart.in

# Update frontend environment
nano src/.env
VITE_API_URL=https://digicart.in/api
VITE_WS_URL=https://digicart.in
VITE_SOCKET_URL=https://digicart.in

# Rebuild frontend
cd src && npm run build && cd ..

# Restart application
pm2 restart whatsapp-campaign-manager
```

---

## 🔒 **Step 5: Setup SSL Certificate**

### Get Free HTTPS Certificate:
```bash
# Install SSL certificate for your domain
sudo certbot --nginx -d digicart.in -d www.digicart.in

# Follow the prompts:
# Enter email address: your-email@example.com
# Agree to terms: A
# Share email: N (optional)
# Redirect HTTP to HTTPS: 2 (Yes, redirect)
```

---

## ✅ **Step 6: Verification**

### Test Your Domain:
```bash
# 1. Test basic connectivity
curl -I http://digicart.in
curl -I https://digicart.in

# 2. Test API endpoints
curl https://digicart.in/health
curl https://digicart.in/api

# 3. Test in browser
# Go to: https://digicart.in
# Should show your WhatsApp Campaign Manager
```

### Verify SSL Certificate:
```bash
# Check SSL certificate
openssl s_client -connect digicart.in:443 -servername digicart.in

# Or use online tools:
# https://www.ssllabs.com/ssltest/analyze.html?d=digicart.in
```

---

## 🚨 **Troubleshooting**

### **Problem: Domain not resolving**
```bash
# Solution 1: Check DNS records
nslookup digicart.in
# Should return your Elastic IP

# Solution 2: Clear DNS cache
# Windows:
ipconfig /flushdns

# Linux/Mac:
sudo systemctl flush-dns
```

### **Problem: SSL certificate issues**
```bash
# Solution: Renew certificate
sudo certbot renew

# Or reinstall:
sudo certbot --nginx -d digicart.in -d www.digicart.in --force-renewal
```

### **Problem: 502 Bad Gateway**
```bash
# Check if your app is running
pm2 status

# Check nginx configuration
sudo nginx -t

# Check app logs
pm2 logs whatsapp-campaign-manager
```

### **Problem: CORS errors**
```bash
# Update CORS settings in your .env file
nano .env
# Ensure CLIENT_URL matches your domain:
CLIENT_URL=https://digicart.in

# Restart app
pm2 restart whatsapp-campaign-manager
```

---

## 📊 **DNS Record Summary**

Your final DNS configuration should look like this:

| Type | Name | Value | TTL | Purpose |
|------|------|-------|-----|---------|
| **A** | @ | YOUR_ELASTIC_IP | 300 | Main domain (digicart.in) |
| **A** | www | YOUR_ELASTIC_IP | 300 | www subdomain |
| **CNAME** | *.digicart.in | digicart.in | 300 | Wildcard (optional) |

---

## 🎉 **Success Checklist**

- [ ] AWS EC2 instance running with Elastic IP
- [ ] DNS A records pointing to your Elastic IP
- [ ] DNS propagation completed (domain resolves)
- [ ] Application environment updated with domain
- [ ] SSL certificate installed and working
- [ ] https://digicart.in loads your application
- [ ] API endpoints working: https://digicart.in/api
- [ ] WhatsApp functionality working

---

## 📞 **Support**

If you encounter issues:

1. **Check DNS**: Use online DNS checkers
2. **Check SSL**: Use SSL testing tools
3. **Check Logs**: `pm2 logs` on your server
4. **Check Status**: `pm2 status` and `sudo systemctl status nginx`

**Your domain digicart.in should now be pointing to your AWS server with your WhatsApp Campaign Manager running!** 🚀