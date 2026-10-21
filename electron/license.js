// Licence verification. Pure Node (no `electron` import) so scripts/run-tests.js
// exercises the exact code that ships.
//
// Keys are Ed25519-signed by the admin dashboard. The app only holds the PUBLIC
// key, so unpacking the installer no longer lets anyone mint licences (the old
// AES scheme shipped its secret inside the app).
const crypto = require('crypto');

const PUBLIC_KEY = crypto.createPublicKey({
  key: Buffer.from('MCowBQYDK2VwAyEARMolMDKEhUo/iwXKSMRfNIgpk0hXDYcffIXiJRHTCcM=', 'base64'),
  format: 'der',
  type: 'spki',
});

const DAY = 86_400_000;
const OFFLINE_GRACE_DAYS = 14;
const TRIAL_DAYS = 7;
const CLOCK_SKEW_MS = 10 * 60 * 1000; // NTP drift allowance

const norm = (s) => String(s).trim().toLowerCase();

/** Admin-side: mint a key. `privateKey` is a KeyObject or base64 PKCS#8 DER. */
function signKey(machineId, expiryDate, privateKey) {
  const key = typeof privateKey === 'string'
    ? crypto.createPrivateKey({ key: Buffer.from(privateKey, 'base64'), format: 'der', type: 'pkcs8' })
    : privateKey;
  const payload = Buffer.from(`${norm(machineId)}|${expiryDate}`);
  return `${payload.toString('base64url')}.${crypto.sign(null, payload, key).toString('base64url')}`;
}

/**
 * Key format: base64url("machineId|expiryISO") + "." + base64url(signature).
 * Returns { expiryDate }; throws on a forged, malformed or foreign-machine key.
 * Expiry is NOT checked here so callers can tell "expired" from "invalid".
 */
function verifyKey(key, machineId, publicKey = PUBLIC_KEY) {
  const [p, s] = String(key || '').trim().split('.');
  if (!p || !s) throw new Error('Invalid license key format');
  const payload = Buffer.from(p, 'base64url');
  if (!crypto.verify(null, payload, publicKey, Buffer.from(s, 'base64url'))) {
    throw new Error('License key signature is invalid');
  }
  const text = payload.toString('utf8');
  const bar = text.indexOf('|');
  const expiryDate = text.slice(bar + 1);
  if (bar < 1 || !Number.isFinite(Date.parse(expiryDate))) throw new Error('Invalid license key payload');
  if (norm(text.slice(0, bar)) !== norm(machineId)) {
    throw new Error('License key is registered for a different Machine ID');
  }
  return { expiryDate };
}

// Trial start date, encrypted with a machine-bound key (unchanged format so
// existing trial files keep working).
// ponytail: trial is client-side only; deleting both trial files restarts it.
// Register trials on the dashboard if that abuse shows up.
const trialKey = (machineId) => crypto.createHash('sha256').update(machineId + '_trial_salt').digest();

function encryptTrialDate(dateStr, machineId) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', trialKey(machineId), iv);
  return iv.toString('hex') + c.update(dateStr, 'utf8', 'hex') + c.final('hex');
}

function decryptTrialDate(blob, machineId) {
  const d = crypto.createDecipheriv('aes-256-cbc', trialKey(machineId), Buffer.from(blob.slice(0, 32), 'hex'));
  return d.update(blob.slice(32), 'hex', 'utf8') + d.final('utf8');
}

/** Decide licence state from local data only. Pure: no IO, injectable clock. */
function evaluate({ settings = {}, trialBlob = null, machineId, now = Date.now(), publicKey }) {
  const lastSeen = Date.parse(settings.lastSeenTime);
  if (now < lastSeen - CLOCK_SKEW_MS) {
    return {
      status: 'EXPIRED', type: 'LICENSE',
      error: 'System clock manipulation detected. Please restore the correct date and time on your computer.',
    };
  }

  if (settings.licenseKey) {
    let expiryDate;
    try {
      ({ expiryDate } = verifyKey(settings.licenseKey, machineId, publicKey));
    } catch (e) {
      return { status: 'NONE', error: e.message };
    }
    if (Date.parse(expiryDate) <= now) {
      return { status: 'EXPIRED', type: 'LICENSE', expiryDate, error: 'Your subscription key validity has expired. Please renew your key.' };
    }
    // Missing (NaN) or future-dated sync time counts as "never synced" so editing
    // settings.json can't switch the offline limit off.
    const syncAge = now - Date.parse(settings.lastSyncTime);
    if (!(syncAge >= -CLOCK_SKEW_MS && syncAge <= OFFLINE_GRACE_DAYS * DAY)) {
      return {
        status: 'EXPIRED', type: 'LICENSE', expiryDate,
        error: `Internet check-in required. This application has been offline for more than ${OFFLINE_GRACE_DAYS} days. Please connect to the internet to verify your subscription.`,
      };
    }
    return { status: 'VALID', type: 'LICENSE', expiryDate };
  }

  if (trialBlob) {
    try {
      const days = (now - Date.parse(decryptTrialDate(trialBlob, machineId))) / DAY;
      if (days >= 0 && days <= TRIAL_DAYS) {
        return { status: 'VALID', type: 'TRIAL', daysRemaining: Math.max(0, TRIAL_DAYS - Math.floor(days)) };
      }
      return { status: 'EXPIRED', type: 'TRIAL', error: 'Trial expired' };
    } catch {
      return { status: 'EXPIRED', type: 'TRIAL', error: 'Trial data tampered or corrupt' };
    }
  }

  return { status: 'NONE', error: 'No license key or trial active' };
}

module.exports = { signKey, verifyKey, evaluate, encryptTrialDate, decryptTrialDate, TRIAL_DAYS };
