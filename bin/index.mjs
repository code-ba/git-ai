#! /usr/bin/env node
const MIN_NODE_VERSION = '12.20.0';

const parseVersion = (version = '') =>
  version
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number(part || 0));

const isVersionLessThan = (current, target) => {
  const currentParts = parseVersion(current);
  const targetParts = parseVersion(target);
  for (let i = 0; i < Math.max(currentParts.length, targetParts.length); i += 1) {
    const currentPart = currentParts[i] || 0;
    const targetPart = targetParts[i] || 0;
    if (currentPart < targetPart) return true;
    if (currentPart > targetPart) return false;
  }
  return false;
};

const notifyNodeVersion = () => {
  const currentVersion = process.version;
  if (isVersionLessThan(process.versions.node, MIN_NODE_VERSION)) {
    console.error(
      `当前 Node.js 版本为 ${currentVersion}，请升级至 ${MIN_NODE_VERSION} 或更高版本后再使用。`
    );
    return false;
  }
  return true;
};

if (!notifyNodeVersion()) {
  process.exit(1);
}

import('./index.cjs').catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
