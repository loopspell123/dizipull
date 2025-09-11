import { promisify } from 'util';
import { exec } from 'child_process';
import https from 'https';

const execAsync = promisify(exec);

// Check if WhatsApp Web is accessible
export async function checkWhatsAppConnectivity() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'web.whatsapp.com',
      port: 443,
      path: '/',
      method: 'HEAD',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };

    const req = https.request(options, (res) => {
      resolve({
        accessible: res.statusCode === 200 || res.statusCode === 302 || res.statusCode === 400 || res.statusCode === 403,
        statusCode: res.statusCode,
        message: res.statusCode === 400 || res.statusCode === 403 ? 
          `WhatsApp Web is accessible (status ${res.statusCode} - normal for HEAD requests)` :
          `WhatsApp Web responded with status ${res.statusCode}`
      });
    });

    req.on('error', (error) => {
      resolve({
        accessible: false,
        error: error.message,
        message: `Cannot reach WhatsApp Web: ${error.message}`
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        accessible: false,
        error: 'timeout',
        message: 'WhatsApp Web connection timeout'
      });
    });

    req.setTimeout(10000);
    req.end();
  });
}

// Check general internet connectivity
export async function checkInternetConnectivity() {
  try {
    // Try to ping Google DNS
    if (process.platform === 'win32') {
      await execAsync('ping -n 1 8.8.8.8');
    } else {
      await execAsync('ping -c 1 8.8.8.8');
    }
    return {
      connected: true,
      message: 'Internet connectivity confirmed'
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      message: 'No internet connectivity detected'
    };
  }
}

// Comprehensive network check
export async function performNetworkCheck() {
  console.log('🌐 Performing network connectivity check...');
  
  const internetCheck = await checkInternetConnectivity();
  console.log(`🔍 Internet: ${internetCheck.connected ? '✅' : '❌'} ${internetCheck.message}`);
  
  if (internetCheck.connected) {
    const whatsappCheck = await checkWhatsAppConnectivity();
    console.log(`🔍 WhatsApp Web: ${whatsappCheck.accessible ? '✅' : '❌'} ${whatsappCheck.message}`);
    
    return {
      internet: internetCheck.connected,
      whatsapp: whatsappCheck.accessible,
      ready: internetCheck.connected && whatsappCheck.accessible,
      issues: []
        .concat(internetCheck.connected ? [] : ['No internet connectivity'])
        .concat(whatsappCheck.accessible ? [] : ['WhatsApp Web not accessible'])
    };
  }
  
  return {
    internet: false,
    whatsapp: false,
    ready: false,
    issues: ['No internet connectivity']
  };
}
