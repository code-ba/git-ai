import axios from 'axios';
import chalk from 'chalk';
import Logger from './Logger.mjs';
import { config } from './Storage.mjs';

import { writeLogFile } from './Log.mjs';
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

export const queryLatestVersion = async (name) => {
  const urls = [`https://registry.npmmirror.com/${name}`, `https://registry.npmjs.org/${name}`];
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

export const saveUpdateInfo = (info, latestVersion) => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  // 各包共用一份配置存储，updateInfo 按包名分开存，避免互相污染版本对比
  config.set(`updateInfo.${info.name}`, {
    latestVersion,
    checkDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    currentVersion: info.version,
  });
};

export const checkUpdate = (info) => {
  const updateInfo = config.get(`updateInfo.${info.name}`) || {};
  if (isVersionLessThan(info.version, updateInfo.latestVersion)) {
    Logger.warn(`发现新版本，请执行更新指令：${chalk.cyan(`npm install -g ${info.name}`)}`);
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (updateInfo.checkDate === today) return;
  queryLatestVersion(info.name).then((latestVersion) => {
    if (latestVersion) saveUpdateInfo(info, latestVersion);
  });
};
