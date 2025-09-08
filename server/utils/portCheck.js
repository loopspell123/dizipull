import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const checkPort = async (port) => {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`, { timeout: 5000 });
      const lines = stdout.trim().split('\n').filter(line => line.includes(`:${port} `));
      return lines.length > 0;
    } else {
      const { stdout } = await execAsync(`lsof -ti:${port}`, { timeout: 5000 });
      return stdout.trim().length > 0;
    }
  } catch (error) {
    // If command fails, assume port is free
    return false;
  }
};

export const killPort = async (port) => {
  try {
    console.log(`🔪 Attempting to kill processes on port ${port}...`);
    
    if (process.platform === 'win32') {
      try {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`, { timeout: 10000 });
        const lines = stdout.trim().split('\n').filter(line => line.includes(`:${port} `));
        
        if (lines.length === 0) {
          console.log(`✅ Port ${port} is already free`);
          return true;
        }

        let killedCount = 0;
        const pidsToKill = new Set(); // Use Set to avoid duplicate PIDs
        
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          
          if (pid && !isNaN(pid) && pid !== '0') {
            pidsToKill.add(pid);
          }
        }

        // Kill each unique PID
        for (const pid of pidsToKill) {
          try {
            await execAsync(`taskkill /PID ${pid} /F`, { timeout: 5000 });
            console.log(`✅ Killed process ${pid} using port ${port}`);
            killedCount++;
          } catch (killError) {
            console.warn(`⚠️  Failed to kill PID ${pid}: ${killError.message}`);
          }
        }

        if (killedCount > 0) {
          console.log(`✅ Successfully killed ${killedCount} processes on port ${port}`);
          // Wait a moment for ports to be released
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (findError) {
        if (findError.message.includes('No such file') || findError.stdout === '') {
          console.log(`✅ Port ${port} is free (no processes found)`);
          return true;
        }
        throw findError;
      }
    } else {
      // Linux/Mac
      try {
        const { stdout } = await execAsync(`lsof -ti:${port}`, { timeout: 10000 });
        const pids = stdout.trim().split('\n').filter(pid => pid && !isNaN(pid));
        
        if (pids.length === 0) {
          console.log(`✅ Port ${port} is already free`);
          return true;
        }

        for (const pid of pids) {
          try {
            await execAsync(`kill -9 ${pid}`, { timeout: 5000 });
            console.log(`✅ Killed process ${pid} using port ${port}`);
          } catch (killError) {
            console.warn(`⚠️  Failed to kill PID ${pid}: ${killError.message}`);
          }
        }
        
        console.log(`✅ Successfully killed ${pids.length} processes on port ${port}`);
        
      } catch (findError) {
        if (findError.stdout === '') {
          console.log(`✅ Port ${port} is free (no processes found)`);
          return true;
        }
        throw findError;
      }
    }
    
    return true;
    
  } catch (error) {
    console.error(`❌ Failed to kill processes on port ${port}:`, error.message);
    console.error(`💡 Try manually killing the process:`);
    
    if (process.platform === 'win32') {
      console.error(`   1. netstat -ano | findstr :${port}`);
      console.error(`   2. taskkill /PID <PID> /F`);
    } else {
      console.error(`   1. lsof -ti:${port}`);
      console.error(`   2. kill -9 <PID>`);
    }
    
    return false;
  }
};

export const findAvailablePort = async (startPort = 3001, endPort = 3010) => {
  console.log(`🔍 Searching for available port between ${startPort} and ${endPort}...`);
  
  for (let port = startPort; port <= endPort; port++) {
    const isInUse = await checkPort(port);
    console.log(`   Port ${port}: ${isInUse ? '❌ OCCUPIED' : '✅ FREE'}`);
    
    if (!isInUse) {
      console.log(`🎯 Found available port: ${port}`);
      return port;
    }
  }
  
  console.log(`❌ No available ports found between ${startPort} and ${endPort}`);
  return null;
};

// Add bulk port checking
export const checkMultiplePorts = async (ports) => {
  console.log('🔍 Checking multiple ports...');
  
  const results = {};
  
  for (const port of ports) {
    const isOccupied = await checkPort(port);
    results[port] = isOccupied;
    console.log(`   Port ${port}: ${isOccupied ? '❌ OCCUPIED' : '✅ FREE'}`);
  }
  
  return results;
};

// Add system information
export const getSystemInfo = async () => {
  try {
    console.log('💻 System Information:');
    console.log(`   Platform: ${process.platform}`);
    console.log(`   Architecture: ${process.arch}`);
    console.log(`   Node Version: ${process.version}`);
    
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('systeminfo | findstr "OS Name"', { timeout: 5000 });
      console.log(`   ${stdout.trim()}`);
    } else {
      const { stdout } = await execAsync('uname -a', { timeout: 5000 });
      console.log(`   OS: ${stdout.trim()}`);
    }
  } catch (error) {
    console.log('   System info unavailable');
  }
};
