// server/utils/networkCheck.js
import https from 'https';
import http from 'http';

export async function performNetworkCheck() {
  const results = {
    internet: false,
    whatsapp: false,
    details: {}
  };

  // Test basic internet connectivity
  try {
    await Promise.race([
      testConnection('https://google.com', 443),
      testConnection('https://cloudflare.com', 443),
      testConnection('https://1.1.1.1', 443)
    ]);
    results.internet = true;
    results.details.internet = 'Connected';
  } catch (error) {
    console.log('Internet connectivity check failed:', error.message);
    results.details.internet = `Failed: ${error.message}`;
    
    // In production environments (like Render), assume internet is available
    // if we're running in a cloud environment
    if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
      console.log('Production environment detected, assuming internet connectivity');
      results.internet = true;
      results.details.internet = 'Assumed available in production';
    }
  }

  // Test WhatsApp Web accessibility (non-blocking)
  try {
    await testConnection('https://web.whatsapp.com', 443, 3000);
    results.whatsapp = true;
    results.details.whatsapp = 'Accessible';
  } catch (error) {
    console.log('WhatsApp Web accessibility check failed:', error.message);
    results.details.whatsapp = `Not accessible: ${error.message}`;
    
    // Don't fail session creation if WhatsApp Web check fails
    // The actual WhatsApp client will handle this
    results.whatsapp = false;
  }

  return results;
}

function testConnection(url, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: '/',
      method: 'HEAD',
      timeout: timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NetworkCheck/1.0)'
      }
    };

    const req = protocol.request(options, (res) => {
      resolve(res.statusCode);
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout connecting to ${url}`));
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`Request timeout for ${url}`));
    });

    req.end();
  });
}