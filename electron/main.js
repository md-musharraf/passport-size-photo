const { app, BrowserWindow, ipcMain, protocol, net, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { pathToFileURL } = require('url');

// Register 'app' scheme as privileged before 'ready'
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
      allowServiceWorkers: true
    }
  }
]);

const SALT = process.env.LICENSE_SECRET_SALT || 'Musharraf_709121SaltKey';
const KEY = crypto.createHash('sha256').update(SALT).digest();

const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const trialPath = path.join(app.getPath('userData'), 'trial.json');
const systemTrialPath = path.join(os.homedir(), '.passport_photo_trial');

let mainWindow;

// Fetch unique system hardware UUID
function getMachineId() {
  try {
    if (process.platform === 'win32') {
      const output = execSync('reg query HKLM\\Software\\Microsoft\\Cryptography /v MachineGuid').toString();
      const match = output.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      if (match) return match[1].trim();
    }
    if (process.platform === 'darwin') {
      const output = execSync("ioreg -rd1 -c IOPlatformExpertDevice | grep -i 'UUID'").toString();
      const match = output.match(/"IOPlatformUUID"\s+=\s+"([^"]+)"/);
      if (match) return match[1].trim();
    }
    if (process.platform === 'linux') {
      if (fs.existsSync('/var/lib/dbus/machine-id')) {
        return fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
      }
      if (fs.existsSync('/etc/machine-id')) {
        return fs.readFileSync('/etc/machine-id', 'utf8').trim();
      }
    }
  } catch (e) {
    console.error('Failed to retrieve hardware UUID:', e);
  }
  // Safe fallback
  return os.hostname() || 'fallback-machine-id';
}

// Decrypt license key string (AES-256-CBC)
function decrypt(licenseKey) {
  const cleanKey = licenseKey.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (cleanKey.length <= 32) {
    throw new Error('Invalid license key format');
  }
  const ivHex = cleanKey.substring(0, 32);
  const encryptedHex = cleanKey.substring(32);
  
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  const parts = decrypted.split('|');
  if (parts.length < 2) {
    throw new Error('Decrypted payload does not contain separator');
  }
  
  return {
    machineId: parts[0],
    expirationDate: parts.slice(1).join('|'),
  };
}

// Encrypt/Decrypt trial date locally bound to machine
function encryptTrialDate(dateStr, machineId) {
  const key = crypto.createHash('sha256').update(machineId + '_trial_salt').digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(dateStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + encrypted;
}

function decryptTrialDate(encryptedStr, machineId) {
  const key = crypto.createHash('sha256').update(machineId + '_trial_salt').digest();
  const ivHex = encryptedStr.substring(0, 32);
  const encryptedHex = encryptedStr.substring(32);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Check local settings for license validity or active trial
function checkLicenseLocal(machineId) {
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (e) {}
  }

  const now = new Date();

  // 1. Anti-Tamper: System Clock Rollback Check
  if (settings.lastSeenTime) {
    const lastSeen = new Date(settings.lastSeenTime);
    // Allow up to a 10-minute grace buffer for standard NTP time syncing drifts
    if (now < new Date(lastSeen.getTime() - 10 * 60 * 1000)) {
      console.error('Security alert: Local system clock rollback detected!');
      return { 
        status: 'EXPIRED', 
        type: 'LICENSE', 
        error: 'System clock manipulation detected. Please restore the correct date and time on your computer.' 
      };
    }
  }

  // Auto-record the last seen execution timestamp in settings
  try {
    settings.lastSeenTime = now.toISOString();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {}

  // 2. License File Validation
  if (settings.licenseKey) {
    try {
      const decrypted = decrypt(settings.licenseKey);
      const decMachineId = decrypted.machineId.trim().toLowerCase();
      const currMachineId = machineId.trim().toLowerCase();
      const expiry = new Date(decrypted.expirationDate);
      
      if (decMachineId !== currMachineId) {
        return { status: 'NONE', error: 'License key is registered for a different Machine ID' };
      }

      if (expiry <= now) {
        return { status: 'EXPIRED', type: 'LICENSE', expiryDate: decrypted.expirationDate, error: 'Your subscription key validity has expired. Please renew your key.' };
      }

      // 3. Offline Enforced Check-in (14-Day Max Offline Window)
      if (settings.lastSyncTime) {
        const lastSync = new Date(settings.lastSyncTime);
        const differenceInTime = now.getTime() - lastSync.getTime();
        const differenceInDays = differenceInTime / (1000 * 3600 * 24);
        
        if (differenceInDays > 14) {
          console.error('Security alert: Maximum offline grace period of 14 days exceeded.');
          return { 
            status: 'EXPIRED', 
            type: 'LICENSE', 
            expiryDate: decrypted.expirationDate,
            error: 'Internet check-in required. This application has been offline for more than 14 days. Please connect to the internet to verify your subscription.' 
          };
        }
      } else {
        // Initialize lastSyncTime on legacy settings
        try {
          settings.lastSyncTime = now.toISOString();
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        } catch (e) {}
      }

      return { status: 'VALID', type: 'LICENSE', expiryDate: decrypted.expirationDate };
    } catch (e) {
      console.error('Local license verification failed:', e);
      return { status: 'NONE', error: 'License validation error: key structure corrupt.' };
    }
  }

  // 2. Trial Check (redundant checks)
  let trialData = null;
  if (fs.existsSync(trialPath)) {
    try {
      trialData = JSON.parse(fs.readFileSync(trialPath, 'utf8'));
    } catch (e) {}
  }
  if (!trialData && fs.existsSync(systemTrialPath)) {
    try {
      const encryptedDate = fs.readFileSync(systemTrialPath, 'utf8').trim();
      trialData = { encryptedDate };
    } catch (e) {}
  }

  if (trialData && trialData.encryptedDate) {
    try {
      const dateStr = decryptTrialDate(trialData.encryptedDate, machineId);
      const trialStartDate = new Date(dateStr);
      const now = new Date();
      const differenceInTime = now.getTime() - trialStartDate.getTime();
      const differenceInDays = differenceInTime / (1000 * 3600 * 24);
      
      if (differenceInDays >= 0 && differenceInDays <= 7) {
        const daysRemaining = Math.max(0, 7 - Math.floor(differenceInDays));
        return { status: 'VALID', type: 'TRIAL', trialStartDate: dateStr, daysRemaining };
      } else {
        return { status: 'EXPIRED', type: 'TRIAL', error: 'Trial expired' };
      }
    } catch (e) {
      console.error('Trial date decryption failed (tampered?):', e);
      return { status: 'EXPIRED', type: 'TRIAL', error: 'Trial data tampered or corrupt' };
    }
  }

  return { status: 'NONE', error: 'No license key or trial active' };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    // The UI is responsive, so small laptops / netbooks (1024x600) work too.
    minWidth: 960,
    minHeight: 600,
    title: 'Passport Photo Generator',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
    icon: path.join(__dirname, '../public/icon.png'),
    show: false,
    // Match the app theme so there is no white flash before the first paint.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121418' : '#EEF0F3'
  });

  // Development mode vs Production mode
  if (!app.isPackaged && (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV)) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production mode (after build) loaded via custom protocol to enable Web Workers/fetch locally
    mainWindow.loadURL('app://localhost/index.html');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': case '.mjs': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.wasm': return 'application/wasm';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.ico': return 'image/x-icon';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    case '.ttf': return 'font/ttf';
    case '.otf': return 'font/otf';
    default: return 'application/octet-stream';
  }
}

// Setup IPC handlers
app.whenReady().then(() => {
  // Protocol handler for 'app' scheme using Node fs instead of net.fetch to ensure ASAR compatibility
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      
      // Default to index.html for root or empty path
      if (filePath === '/' || filePath === '') {
        filePath = '/index.html';
      }
      
      // Target file path in the 'out' directory
      let absolutePath = path.normalize(path.join(__dirname, '..', 'out', filePath));
      
      // Check if file exists. If it doesn't and doesn't have an extension (Next.js route), serve index.html
      if (!fs.existsSync(absolutePath)) {
        if (!filePath.includes('.')) {
          const fallbackPath = path.normalize(path.join(__dirname, '..', 'out', 'index.html'));
          if (fs.existsSync(fallbackPath)) {
            absolutePath = fallbackPath;
          } else {
            console.warn(`[app-protocol] Route fallback not found: ${filePath}`);
            return new Response('Not Found', { status: 404 });
          }
        } else {
          console.warn(`[app-protocol] File not found: ${filePath} (resolved to: ${absolutePath})`);
          return new Response('Not Found', { status: 404 });
        }
      }
      
      // Async read: the AI model files are tens of MB and a synchronous read
      // would freeze the main process (and the window) while they load.
      const data = await fs.promises.readFile(absolutePath);
      const mimeType = getMimeType(absolutePath);
      
      return new Response(data, {
        status: 200,
        headers: { 
          'content-type': mimeType,
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp'
        }
      });
    } catch (error) {
      console.error('[app-protocol] Error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  });

  // Machine ID IPC
  ipcMain.handle('get-machine-id', async () => {
    return getMachineId();
  });

  // License check IPC
  ipcMain.handle('license-check', async () => {
    const machineId = getMachineId();
    return checkLicenseLocal(machineId);
  });

  // License activate IPC
  ipcMain.handle('license-activate', async (event, licenseKey) => {
    const machineId = getMachineId();
    try {
      const decrypted = decrypt(licenseKey);
      const decMachineId = decrypted.machineId.trim().toLowerCase();
      const currMachineId = machineId.trim().toLowerCase();
      const expiry = new Date(decrypted.expirationDate);
      
      if (decMachineId !== currMachineId) {
        return { success: false, error: 'License key is registered for a different Machine ID' };
      }
      
      if (expiry <= new Date()) {
        return { success: false, error: 'License key has expired' };
      }
      
      // Save license locally while preserving other settings
      let settings = {};
      if (fs.existsSync(settingsPath)) {
        try {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch (e) {}
      }
      settings.licenseKey = licenseKey;
      settings.lastSyncTime = new Date().toISOString(); // Start the 14-day grace window upon successful activation
      settings.lastSeenTime = new Date().toISOString();
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return { success: true, expiryDate: decrypted.expirationDate };
    } catch (e) {
      console.error('Failed to activate license:', e);
      return { success: false, error: 'Invalid license key structure or corrupt payload' };
    }
  });

  // Record successful online sync IPC handler
  ipcMain.handle('record-sync', async () => {
    try {
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const nowStr = new Date().toISOString();
        settings.lastSyncTime = nowStr;
        settings.lastSeenTime = nowStr;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
      return { success: true };
    } catch (e) {
      console.error('Failed to record sync in settings:', e);
      return { success: false };
    }
  });

  // Get remote admin dashboard URL IPC
  ipcMain.handle('get-dashboard-url', async () => {
    let dashboardUrl = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_URL || 'https://adminphotomanagement.vercel.app';
    try {
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (settings.dashboardUrl) {
          dashboardUrl = settings.dashboardUrl;
        }
      }
    } catch (e) {
      console.error('Failed to read dashboardUrl from settings:', e);
    }
    return dashboardUrl;
  });

  // Save remote admin dashboard URL IPC
  ipcMain.handle('save-dashboard-url', async (event, url) => {
    try {
      let settings = {};
      if (fs.existsSync(settingsPath)) {
        try {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch (e) {}
      }
      settings.dashboardUrl = url;
      settings.dashboardUrlConfigured = true; // Mark as explicitly configured
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return { success: true };
    } catch (e) {
      console.error('Failed to save dashboardUrl to settings:', e);
      return { success: false, error: e.message };
    }
  });

  // Check if dashboard URL has been explicitly configured
  ipcMain.handle('is-dashboard-configured', async () => {
    try {
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        return { configured: !!settings.dashboardUrlConfigured };
      }
    } catch (e) {}
    return { configured: false };
  });

  // Request free trial IPC
  ipcMain.handle('license-request-trial', async () => {
    const machineId = getMachineId();
    
    // Check if trial has already been claimed on this system
    if (fs.existsSync(trialPath) || fs.existsSync(systemTrialPath)) {
      return { success: false, error: 'Trial has already been claimed on this machine.' };
    }
    
    try {
      const trialStartDateStr = new Date().toISOString();
      const encryptedDate = encryptTrialDate(trialStartDateStr, machineId);
      
      // Write locally
      fs.writeFileSync(trialPath, JSON.stringify({ encryptedDate }, null, 2));
      fs.writeFileSync(systemTrialPath, encryptedDate);
      
      return { success: true, daysRemaining: 7 };
    } catch (e) {
      console.error('Failed to create trial key:', e);
      return { success: false, error: 'Failed to initialize trial' };
    }
  });

  // Wipe local license key IPC — preserves dashboardUrl and other settings
  ipcMain.handle('license-wipe', async () => {
    try {
      // Clear licenseKey from settings.json WITHOUT deleting the whole file
      // (settings.json also stores dashboardUrl which must be preserved)
      if (fs.existsSync(settingsPath)) {
        try {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          delete settings.licenseKey;
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        } catch (e) {
          // If settings file is corrupted, delete it entirely as fallback
          fs.unlinkSync(settingsPath);
        }
      }
      if (fs.existsSync(trialPath)) {
        fs.unlinkSync(trialPath);
      }
      if (fs.existsSync(systemTrialPath)) {
        fs.unlinkSync(systemTrialPath);
      }
      return { success: true };
    } catch (e) {
      console.error('Failed to wipe local license settings:', e);
      return { success: false, error: 'Failed to wipe local settings' };
    }
  });


  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

