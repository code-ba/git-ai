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

    if (code === 0) {
      Logger.verbose(message);
    } else {
      Logger.verbose(message);
    }
  }
  process.exit(code);
};
export const createDeviceId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 64;
  let deviceId = '';
  for (let i = 0; i < length; i++) {
    deviceId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return deviceId;
};
/**
 * 获取设备ID
 */
export const getDeviceId = () => {
  return config.get('deviceId') || createDeviceId();
};

/**
 * 格式化 token 显示（隐藏中间部分）
 * @param {string} token - 单个或多个 token（逗号分隔）
 * @returns {string} 格式化后的 token 字符串
 */
export const formatToken = (token) => {
  if (!token) return '';

  return token
    .split(',')
    .map((t) => {
      const len = t.length;
      if (len < 12) return `${t.slice(0, len < 5 ? 1 : 3)}...`;
      return `${t.slice(0, 5)}...${t.slice(-5)}`;
    })
    .join('、');
};
// 写个方法，传入 [string,string]，随机取1个
export const randomItem = (arr) => {
  return arr[Math.floor(Math.random() * arr.length)];
};
export const getOpenAiConfig = (key) => {
  const item = config.get(key) || '';
  const arr = item ? item.split(',') : [];
  return randomItem(arr) || '';
};
export const getRandomItem = (str) => {
  const arr = str ? str.split(',') : [];
  return randomItem(arr) || '';
};
