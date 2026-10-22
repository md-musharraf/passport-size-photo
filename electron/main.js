const { app, BrowserWindow, ipcMain, protocol, net, nativeTheme, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const { verifyKey, evaluate, encryptTrialDate, TRIAL_DAYS } = require('./license');

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

// Baked in: letting users repoint the licence server let a fake server
// "approve" a paused licence. The env override only works in dev builds.
const DASHBOARD_URL = (!app.isPackaged && process.env.ADMIN_DASHBOARD_URL) || 'https://adminphotomanagement.vercel.app';

const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const trialPath = path.join(app.getPath('userData'), 'trial.json');
const systemTrialPath = path.join(os.homedir(), '.passport_photo_trial');

let mainWindow;

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const readSettings = () => readJson(settingsPath) || {};
const writeSettings = (s) => fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2));
const readTrial = () => {
  const local = readJson(trialPath)?.encryptedDate;
  if (local) return local;
  try { return fs.readFileSync(systemTrialPath, 'utf8').trim() || null; } catch { return null; }
};

// Hardware UUID. It never changes, so resolve it once (it used to shell out on every poll).
let machineIdCache;
function getMachineId() {
  if (machineIdCache) return machineIdCache;
  try {
    if (process.platform === 'win32') {
      machineIdCache = execSync('reg query HKLM\\Software\\Microsoft\\Cryptography /v MachineGuid').toString().match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1];
    } else if (process.platform === 'darwin') {
      machineIdCache = execSync("ioreg -rd1 -c IOPlatformExpertDevice | grep -i 'UUID'").toString().match(/"IOPlatformUUID"\s+=\s+"([^"]+)"/)?.[1];
    } else {
      machineIdCache = ['/var/lib/dbus/machine-id', '/etc/machine-id']
        .map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } })
        .find(Boolean);
    }
  } catch (e) {
    console.error('Failed to retrieve hardware UUID:', e);
  }
  machineIdCache = (machineIdCache || os.hostname() || 'fallback-machine-id').trim();
  return machineIdCache;
}

// Ask the dashboard for this machine's status. Throws when unreachable or on an
// unexpected reply, so a Vercel/Supabase outage counts as "offline" - it must
// never be mistaken for "licence deleted" (any 404 used to wipe the licence).
async function fetchRemoteStatus(machineId) {
  const res = await net.fetch(`${DASHBOARD_URL}/api/license/status?machineId=${encodeURIComponent(machineId)}`, {
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => null);
  if (body?.status === 'DELETED') return { status: 'DELETED' };
  if (res.ok && body?.success) return { status: body.status || 'ACTIVE', licenseKey: body.licenseKey };
  throw new Error(`Dashboard replied ${res.status}`);
}

async function checkLicense({ remote = true } = {}) {
  const machineId = getMachineId();
  const settings = readSettings();
  let server = 'NONE';
  let online = false;

  if (remote) {
    try {
      const r = await fetchRemoteStatus(machineId);
      online = true;
      server = r.status;
      settings.lastSyncTime = new Date().toISOString();
      if (server === 'ACTIVE' && r.licenseKey) {
        // Auto-renew: adopt the dashboard's key if it is genuine and for this machine.
        try { verifyKey(r.licenseKey, machineId); settings.licenseKey = r.licenseKey; } catch { /* keep ours */ }
      }
    } catch {
      // Offline or dashboard down: the local key + offline grace window decide.
    }
  }

  // Unregistered is normal during a trial, so DELETED only revokes an existing licence.
  const revoked = server === 'PAUSED' || server === 'STOPPED' || (server === 'DELETED' && !!settings.licenseKey);
  if (server === 'DELETED') delete settings.licenseKey;

  const result = revoked
    ? {
        status: 'EXPIRED', type: 'LICENSE', daysRemaining: 0,
        error: server === 'DELETED'
          ? 'This Machine ID is not registered or has been deleted from the database.'
          : `Access blocked by administrator. License status is currently ${server}.`,
      }
    : evaluate({ settings, trialBlob: readTrial(), machineId });

  // Never move "last seen" backwards, so rolling the clock back stays detected.
  settings.lastSeenTime = new Date(Math.max(Date.now(), Date.parse(settings.lastSeenTime) || 0)).toISOString();
  try { writeSettings(settings); } catch (e) { console.error('Failed to save settings:', e); }

  return { ...result, machineId, remote: server, online, lastSyncTime: settings.lastSyncTime || null };
}

// Background updates from GitHub Releases (electron-updater): downloads quietly,
// installs on next quit. Packaged builds only. One OS notification per version:
// checkForUpdatesAndNotify re-announced the same cached update every 6 h.
function startAutoUpdates() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require('electron-updater');
  let notifiedVersion;
  autoUpdater.on('update-downloaded', ({ version }) => {
    if (version === notifiedVersion) return;
    notifiedVersion = version;
    new Notification({ title: 'Update ready', body: `Version ${version} will install when you close the app.` }).show();
  });
  const check = () => autoUpdater.checkForUpdates().catch((e) => console.warn('[updater]', e.message));
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
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
      webSecurity: false,
      // No DevTools in shipped builds: they allowed poking the licence bridge.
      devTools: !app.isPackaged
    },
    icon: path.join(__dirname, '../public/icon.png'),
    show: false,
    // Match the app theme so there is no white flash before the first paint.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121418' : '#EEF0F3'
  });
  // No File/Edit/View/Window bar on Windows/Linux; the app has its own toolbar.
  mainWindow.removeMenu();

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
      // Decoding happens after URL normalisation, so "..%2F" would escape out/.
      if (filePath.split(/[\\/]/).includes('..')) return new Response('Forbidden', { status: 403 });

      // Default to index.html for root or empty path
      if (filePath === '/' || filePath === '') {
        filePath = '/index.html';
      }
      
      // Target file path in the 'out' directory
      let absolutePath = path.normalize(path.join(__dirname, '..', 'out', filePath));
      
      // If not in 'out', check 'public' directory (e.g. models or assets)
      if (!fs.existsSync(absolutePath)) {
        const publicPath = path.normalize(path.join(__dirname, '..', 'public', filePath));
        if (fs.existsSync(publicPath)) {
          absolutePath = publicPath;
        }
      }
      
      // Check if file exists. If it doesn't and it's a route (not a model/asset file), serve index.html
      if (!fs.existsSync(absolutePath)) {
        if (!filePath.includes('.') && !filePath.startsWith('/models/')) {
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
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'cross-origin'
        }
      });
    } catch (error) {
      console.error('[app-protocol] Error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  });

  ipcMain.handle('license-check', (_e, opts) => checkLicense(opts));

  ipcMain.handle('license-activate', async (_e, licenseKey) => {
    try {
      const { expiryDate } = verifyKey(licenseKey, getMachineId());
      if (Date.parse(expiryDate) <= Date.now()) return { success: false, error: 'License key has expired' };
      // Activation starts the offline grace window.
      writeSettings({ ...readSettings(), licenseKey: String(licenseKey).trim(), lastSyncTime: new Date().toISOString() });
      return { success: true, expiryDate };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('license-request-trial', async () => {
    if (fs.existsSync(trialPath) || fs.existsSync(systemTrialPath)) {
      return { success: false, error: 'Trial has already been claimed on this machine.' };
    }
    try {
      const encryptedDate = encryptTrialDate(new Date().toISOString(), getMachineId());
      fs.writeFileSync(trialPath, JSON.stringify({ encryptedDate }, null, 2));
      fs.writeFileSync(systemTrialPath, encryptedDate);
      return { success: true, daysRemaining: TRIAL_DAYS };
    } catch (e) {
      console.error('Failed to create trial key:', e);
      return { success: false, error: 'Failed to initialize trial' };
    }
  });

  createWindow();
  startAutoUpdates();

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
