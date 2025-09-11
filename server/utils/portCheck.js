// utils/portCheck.js
import { exec } from 'child_process';
import { promisify } from 'util';
import net from 'net';

const execAsync = promisify(exec);

/**
 * Check if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - True if port is available, false if in use
 */
export async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Find an available port within a range
 * @param {number} startPort - Starting port number
 * @param {number} endPort - Ending port number
 * @returns {Promise<number|null>} - Available port number or null if none found
 */
export async function findAvailablePort(startPort = 3001, endPort = 3010) {
  for (let port = startPort; port <= endPort; port++) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  return null;
}

/**
 * Kill process using a specific port (Windows and Unix compatible)
 * @param {number} port - Port number
 * @returns {Promise<boolean>} - True if successfully killed, false otherwise
 */
export async function killPort(port) {
  try {
    console.log(`🔍 Looking for processes using port ${port}...`);
    
    let command;
    let killCommand;
    
    // Detect OS and use appropriate commands
    if (process.platform === 'win32') {
      // Windows commands
      command = `netstat -ano | findstr :${port}`;
      
      try {
        const { stdout } = await execAsync(command);
        
        if (!stdout.trim()) {
          console.log(`📭 No processes found using port ${port}`);
          return false;
        }
        
        // Extract PIDs from netstat output
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && !isNaN(pid)) {
            pids.add(pid);
          }
        }
        
        console.log(`🎯 Found PIDs using port ${port}:`, Array.from(pids));
        
        // Kill each process
        let killedCount = 0;
        for (const pid of pids) {
          try {
            await execAsync(`taskkill /PID ${pid} /F`);
            killedCount++;
            console.log(`✅ Killed process ${pid}`);
          } catch (killError) {
            console.warn(`⚠️ Failed to kill process ${pid}:`, killError.message);
          }
        }
        
        return killedCount > 0;
        
      } catch (findError) {
        console.warn(`⚠️ Error finding processes on Windows:`, findError.message);
        return false;
      }
      
    } else {
      // Unix/Linux/Mac commands
      command = `lsof -ti:${port}`;
      
      try {
        const { stdout } = await execAsync(command);
        
        if (!stdout.trim()) {
          console.log(`📭 No processes found using port ${port}`);
          return false;
        }
        
        const pids = stdout.trim().split('\n').filter(pid => pid && !isNaN(pid));
        console.log(`🎯 Found PIDs using port ${port}:`, pids);
        
        // Kill each process
        let killedCount = 0;
        for (const pid of pids) {
          try {
            await execAsync(`kill -9 ${pid}`);
            killedCount++;
            console.log(`✅ Killed process ${pid}`);
          } catch (killError) {
            console.warn(`⚠️ Failed to kill process ${pid}:`, killError.message);
          }
        }
        
        return killedCount > 0;
        
      } catch (findError) {
        console.warn(`⚠️ Error finding processes on Unix:`, findError.message);
        return false;
      }
    }
    
  } catch (error) {
    console.error(`❌ Error killing port ${port}:`, error.message);
    return false;
  }
}

/**
 * Get detailed information about what's using a port
 * @param {number} port - Port number to check
 * @returns {Promise<Array>} - Array of process information
 */
export async function getPortInfo(port) {
  try {
    let command;
    
    if (process.platform === 'win32') {
      command = `netstat -ano | findstr :${port}`;
    } else {
      command = `lsof -i:${port}`;
    }
    
    const { stdout } = await execAsync(command);
    
    if (!stdout.trim()) {
      return [];
    }
    
    const lines = stdout.trim().split('\n');
    const processes = [];
    
    for (const line of lines) {
      if (process.platform === 'win32') {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          processes.push({
            protocol: parts[0],
            localAddress: parts[1],
            foreignAddress: parts[2],
            state: parts[3],
            pid: parts[4]
          });
        }
      } else {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 9) {
          processes.push({
            command: parts[0],
            pid: parts[1],
            user: parts[2],
            fd: parts[3],
            type: parts[4],
            device: parts[5],
            node: parts[7],
            name: parts[8]
          });
        }
      }
    }
    
    return processes;
    
  } catch (error) {
    console.error(`❌ Error getting port info for ${port}:`, error.message);
    return [];
  }
}

/**
 * Check multiple ports and return their status
 * @param {number[]} ports - Array of port numbers to check
 * @returns {Promise<Object>} - Object with port status
 */
export async function checkMultiplePorts(ports) {
  const results = {};
  
  for (const port of ports) {
    const available = await isPortAvailable(port);
    results[port] = {
      available,
      info: available ? null : await getPortInfo(port)
    };
  }
  
  return results;
}

/**
 * Wait for a port to become available
 * @param {number} port - Port to wait for
 * @param {number} timeout - Maximum wait time in milliseconds
 * @param {number} interval - Check interval in milliseconds
 * @returns {Promise<boolean>} - True if port becomes available within timeout
 */
export async function waitForPortAvailable(port, timeout = 30000, interval = 1000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const available = await isPortAvailable(port);
    if (available) {
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return false;
}

export default {
  isPortAvailable,
  findAvailablePort,
  killPort,
  getPortInfo,
  checkMultiplePorts,
  waitForPortAvailable
};