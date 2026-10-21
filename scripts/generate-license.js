// Offline licence minting for the admin. Normally the dashboard issues keys;
// this is the fallback. Needs the Ed25519 private key (same value as the
// dashboard's LICENSE_PRIVATE_KEY) — it is never shipped with the app.
//
//   LICENSE_PRIVATE_KEY=... node scripts/generate-license.js <Machine_ID> <YYYY-MM-DD>
//   node scripts/generate-license.js --keypair     # create a NEW keypair (invalidates all keys!)
const crypto = require('crypto');
const { signKey } = require('../electron/license');

const [machineId, expiry] = process.argv.slice(2);

if (machineId === '--keypair') {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  console.log('LICENSE_PRIVATE_KEY=' + privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
  console.log('Public key (paste into electron/license.js): ' + publicKey.export({ format: 'der', type: 'spki' }).toString('base64'));
  process.exit(0);
}

if (!machineId || !expiry || !Number.isFinite(Date.parse(expiry)) || !process.env.LICENSE_PRIVATE_KEY) {
  console.log('\nUsage: LICENSE_PRIVATE_KEY=<base64> node scripts/generate-license.js <Machine_ID> <Expiry_YYYY-MM-DD>\n');
  process.exit(1);
}

const expiryDate = new Date(expiry).toISOString();
console.log(`\nMachine ID:  ${machineId}\nExpiry Date: ${expiryDate}\nLicense Key: ${signKey(machineId, expiryDate, process.env.LICENSE_PRIVATE_KEY)}\n`);
