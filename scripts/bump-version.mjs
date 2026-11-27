import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import axios from 'axios';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoPath = path.resolve(__dirname, '..');
const packagesDir = path.join(repoPath, 'packages');
const lockPath = path.join(repoPath, 'package-lock.json');

const registries = ['https://registry.npmjs.org', 'https://registry.npmmirror.com'];

const bumpPatchVersion = (version) => {
  const parts = version.split('.').map((num) => parseInt(num, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`无法解析版本号: ${version}`);
  }
  parts[2] += 1;
  return parts.join('.');
};

const fetchPublishedVersions = async (registry, name) => {
  try {
    const { data } = await axios.get(`${registry}/${encodeURIComponent(name)}`);
    return data && data.versions ? Object.keys(data.versions) : [];
  } catch (error) {
    if (error.response && error.response.status === 404) return [];
    throw error;
  }
};

const isVersionPublished = async (name, version) => {
  let lastError;
  for (const registry of registries) {
    try {
      const versions = await fetchPublishedVersions(registry, name);
      return versions.includes(version);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const updatePackageJson = (pkgPath, pkg, nextVersion) => {
  pkg.version = nextVersion;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
};

const updateLockFile = (dir, nextVersion) => {
  if (!existsSync(lockPath)) return;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const entry = lock.packages && lock.packages[`packages/${dir}`];
  if (entry) {
    entry.version = nextVersion;
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
};

const listPackageDirs = () =>
  existsSync(packagesDir)
    ? readdirSync(packagesDir).filter((dir) => statSync(path.join(packagesDir, dir)).isDirectory())
    : [];

const main = async () => {
  for (const dir of listPackageDirs()) {
    const pkgPath = path.join(packagesDir, dir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.private) continue;
    const published = await isVersionPublished(pkg.name, pkg.version);
    if (!published) {
      console.log(`${pkg.name} 线上不存在版本 ${pkg.version}，无需递增`);
      continue;
    }
    const nextVersion = bumpPatchVersion(pkg.version);
    updatePackageJson(pkgPath, pkg, nextVersion);
    updateLockFile(dir, nextVersion);
    console.log(`${pkg.name} 版本号已自动递增至 ${nextVersion}`);
  }
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
