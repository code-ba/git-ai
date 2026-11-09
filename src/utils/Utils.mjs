import axios from 'axios';
import chalk from 'chalk';
import Logger from './Logger.mjs';
import { config } from './Storage.mjs';

import { writeLogFile } from './Log.mjs';
import { VERSION } from '../const.mjs';
/**
 * 退出进程
 */
export const exitProcess = (code = 0, startTimestamp) => {
  writeLogFile();
  if (startTimestamp) {
    const endTimestamp = Date.now();
    const duration = endTimestamp - startTimestamp;
    const durationText = `${(duration / 1000).toFixed(3)} 秒`;
    const message = `本次执行指令${
      duration > 10000 ? '耗时' : '用时'
    }: ${durationText}，程序退出...`;

    Logger.verbose(message);
  }
  process.exit(code);
};
// 从数组中随机取一项
export const randomItem = (arr) => {
  return arr[Math.floor(Math.random() * arr.length)];
};
export const getOpenAiConfig = (key) => {
  const item = config.get(key) || '';
  const arr = item ? item.split(',') : [];
  return randomItem(arr) || '';
};
const isVersionLessThan = (a, b) => {
  const parse = (version) =>
    String(version)
      .split('.')
      .map((num) => parseInt(num, 10) || 0);
  const aParts = parse(a);
  const bParts = parse(b);
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
};

export const queryLatestVersion = async () => {
  const urls = [
    'https://registry.npmmirror.com/@git-ai/cli',
    'https://registry.npmjs.org/@git-ai/cli',
  ];
  for (const url of urls) {
    try {
      const { data } = await axios.get(url, { timeout: 10 * 1000 });
      const latestVersion = data['dist-tags'] && data['dist-tags'].latest;
      if (latestVersion) return latestVersion;
    } catch {
      continue;
    }
  }
  return '';
};

export const saveUpdateInfo = (latestVersion) => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  config.set('updateInfo', {
    latestVersion,
    checkDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    currentVersion: VERSION,
    needUpdate: isVersionLessThan(VERSION, latestVersion),
  });
};

export const checkUpdate = () => {
  const updateInfo = config.get('updateInfo') || {};
  if (updateInfo.needUpdate) {
    Logger.warn(
      `发现新版本 ${updateInfo.latestVersion}，请执行：${chalk.cyan('npm install -g @git-ai/cli')}`
    );
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (updateInfo.checkDate === today) return;
  queryLatestVersion().then((latestVersion) => {
    if (latestVersion) saveUpdateInfo(latestVersion);
  });
};
