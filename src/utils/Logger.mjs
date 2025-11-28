import npmlog from 'npmlog';
import { BIN } from '../const.mjs';
import { collectLoggerLog } from './Log.mjs';

npmlog.level = 'info';
npmlog.heading = BIN.replace(' ', '-'); // 修改前缀
npmlog.headingStyle = { fg: 'red', bg: 'black' }; // 修改前缀样式
npmlog.addLevel('success', 2000, { fg: 'green', bold: true }); // 添加自定义命令
npmlog.addLevel('verbose', 2000, { fg: 'blue', bg: 'black' }, 'verb'); // 添加自定义命令，Number 数字1000会无法显示，建议2000

const levelsToWrap = [
  'info',
  'warn',
  'error',
  'success',
  'verb',
  'verbose',
  'silly',
  'http',
  'notice',
];

levelsToWrap.forEach((level) => {
  if (typeof npmlog[level] !== 'function') {
    return;
  }
  const original = npmlog[level].bind(npmlog);
  npmlog[level] = (...args) => {
    collectLoggerLog(level, args);
    return original(...args);
  };
});

export default npmlog;
