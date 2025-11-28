import fs from 'fs';
import path from 'path';
import os from 'os';
import { NAME } from '../const.mjs';
import npmlog from 'npmlog';

// 日志收集器
const logCollector = [];
const MAX_DETAIL_LENGTH = 2000;

const truncate = (content = '') => {
  if (typeof content !== 'string') {
    return content;
  }
  return content.length > MAX_DETAIL_LENGTH
    ? `${content.slice(0, MAX_DETAIL_LENGTH)}\n...[truncated]`
    : content;
};

const pushLog = (entry) => {
  logCollector.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
};

export function collectError(err, context = '') {
  const errorMessage = (err && (err.stack || err.message)) || String(err);
  pushLog({
    source: 'error',
    level: 'error',
    context,
    message: truncate(errorMessage),
  });
}

export function collectWarning(message = '', context = '') {
  pushLog({
    source: 'warning',
    level: 'warning',
    context,
    message: truncate(message),
  });
}

export function collectGitExecLog(entry = {}) {
  const { command = '', options = {}, status = 'success', output = '', error = '' } = entry;
  pushLog({
    source: 'git-exec',
    level: status,
    command,
    options,
    message: truncate(output),
    error: truncate(error),
  });
}

export function collectLoggerLog(level, message) {
  const payload = Array.isArray(message) ? message : [message];
  pushLog({
    source: 'logger',
    level,
    message: truncate(payload.filter(Boolean).join(' ')),
  });
}

export function collectSpinnerState(state, text = '') {
  pushLog({
    source: 'spinner',
    level: state,
    message: truncate(text),
  });
}

export function writeLogFile() {
  if (logCollector.length === 0) {
    return null;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const logDir = path.join(
    os.homedir(),
    '.config',
    NAME.replace('@', '/'),
    'logs',
    `${year}-${month}`
  );

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}_${hour}-${minute}-${second}`;
  const logFile = path.join(logDir, `log-${dateStr}.txt`);

  let logContent = `日志收集器\n生成时间: ${now.toLocaleString('zh-CN')}\n`;
  logContent += `${'='.repeat(80)}\n\n`;

  logCollector.forEach((item, index) => {
    logContent += `[日志 ${index + 1}]\n`;
    logContent += `时间: ${item.timestamp}\n`;
    logContent += `来源: ${item.source}\n`;
    if (item.level) {
      logContent += `级别: ${item.level}\n`;
    }
    if (item.context) {
      logContent += `上下文: ${item.context}\n`;
    }
    if (item.command) {
      logContent += `命令: ${item.command}\n`;
    }
    if (item.options && Object.keys(item.options).length) {
      logContent += `参数: ${JSON.stringify(item.options)}\n`;
    }
    if (item.message) {
      logContent += `内容:\n${item.message}\n`;
    }
    if (item.error) {
      logContent += `错误:\n${item.error}\n`;
    }
    logContent += `${'-'.repeat(80)}\n\n`;
  });

  fs.writeFileSync(logFile, logContent, 'utf8');

  const errorCount = logCollector.filter((item) => item.level === 'error').length;
  if (errorCount > 0) {
    npmlog.verbose(`日志地址: ${logFile}`);
  }

  return logFile;
}
