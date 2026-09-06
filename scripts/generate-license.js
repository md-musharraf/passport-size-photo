const crypto = require('crypto');

// The shared secret salt must match the one in electron/main.js
const SALT = process.env.LICENSE_SECRET_SALT || 'Musharraf_709121SaltKey';
const KEY = crypto.createHash('sha256').update(SALT).digest();

/**
 * Generate a license key for a specific Machine ID and Expiration Date.
 * @param {string} machineId The hardware GUID shown on the client's screen
 * @param {string} expiryDate Expiration date in YYYY-MM-DD format
 * @returns {string} The cryptographically signed license key
 */
function generateLicenseKey(machineId, expiryDate) {
  const cleanMachineId = machineId.trim().toLowerCase();
  const payload = `${cleanMachineId}|${expiryDate}`;
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  
  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Combine IV hex (32 characters) + Ciphertext hex
  const licenseKey = iv.toString('hex') + encrypted;
  return licenseKey.toLowerCase();
}

// Example usage: node scripts/generate-license.js "MACHINE-GUID-HERE" "2027-12-31"
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('\nUsage: node scripts/generate-license.js <Machine_ID> <Expiry_Date_YYYY-MM-DD>');
  console.log('Example: node scripts/generate-license.js "52a514d2-fb9f-43b3-a123-ab3d5f308a10" "2027-12-31"\n');
  process.exit(1);
}

const machineId = args[0];
const expiryDate = args[1];

try {
  const key = generateLicenseKey(machineId, expiryDate);
  console.log('\n--------------------------------------------------');
  console.log('License Key Generated Successfully!');
  console.log('--------------------------------------------------');
  console.log(`Machine ID:  ${machineId}`);
  console.log(`Expiry Date: ${expiryDate}`);
  console.log(`License Key: ${key}`);
  console.log('--------------------------------------------------\n');
} catch (e) {
  console.error('Failed to generate license key:', e);
}
