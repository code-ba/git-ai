import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkgPath = path.resolve(__dirname, '../package.json');
const lockPath = path.resolve(__dirname, '../package-lock.json');

const bumpPatchVersion = (version) => {
  const parts = version.split('.').map((num) => parseInt(num, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`无法解析版本号: ${version}`);
  }
  parts[2] += 1;
  return parts.join('.');
};

const updatePackageJson = () => {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const nextVersion = bumpPatchVersion(pkg.version);
  pkg.version = nextVersion;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return nextVersion;
};

const updateLockFile = (nextVersion) => {
  if (!existsSync(lockPath)) return;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.version = nextVersion;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = nextVersion;
  }
  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
};

try {
  const nextVersion = updatePackageJson();
  updateLockFile(nextVersion);
  console.log(`版本号已自动递增至 ${nextVersion}`);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
