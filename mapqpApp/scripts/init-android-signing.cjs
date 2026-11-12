const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const credentialsFile = path.join(root, 'credentials.json');
const keystore = path.join(root, '.credentials', 'upload.jks');
if (fs.existsSync(credentialsFile) || fs.existsSync(keystore)) {
  throw new Error('Signing credentials already exist; refusing to overwrite them.');
}
const password = crypto.randomBytes(32).toString('hex');
fs.mkdirSync(path.dirname(keystore), { recursive: true });
const keytool = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';
const result = spawnSync(keytool, ['-genkeypair', '-keystore', keystore, '-storetype', 'JKS',
  '-alias', 'mapqp-upload', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
  '-dname', 'CN=mapQP Upload', '-storepass:env', 'MAPQP_SIGNING_PASSWORD',
  '-keypass:env', 'MAPQP_SIGNING_PASSWORD', '-noprompt'], {
  env: { ...process.env, MAPQP_SIGNING_PASSWORD: password }, stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
fs.writeFileSync(credentialsFile, JSON.stringify({ android: { keystore: {
  keystorePath: '.credentials/upload.jks', keystorePassword: password,
  keyAlias: 'mapqp-upload', keyPassword: password,
} } }, null, 2) + '\n', { mode: 0o600 });
console.log('Created a private upload key and credentials.json. Back up both securely; reuse them for all future releases.');
