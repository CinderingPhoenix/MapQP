const { spawnSync } = require('node:child_process');
const path = require('node:path');
const targets = {
  phone: ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a'],
  emulator: ['assembleRelease', '-PreactNativeArchitectures=x86_64'],
  bundle: ['bundleRelease'],
};
const args = targets[process.argv[2]];
if (!args) throw new Error('Choose phone, emulator, or bundle');
const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', args, {
  cwd: path.resolve(__dirname, '../android'), stdio: 'inherit', shell: process.platform === 'win32',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
