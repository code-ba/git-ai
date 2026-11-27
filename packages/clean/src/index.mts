import { Command } from 'commander';
import { exitProcess, checkUpdate, setLoggerHeading, Logger } from '@git-ai/shared';
import { BIN, VERSION, NAME } from './constants/package.mjs';
import CleanAction from './actions/CleanAction.mjs';

let startTimestamp;
function registerCommand() {
  const program = new Command();
  program.name(BIN).version(VERSION);
  setLoggerHeading(BIN);
  program.description(`清理被 .gitignore 忽略却已提交的文件（本地文件保留）`).action(CleanAction);
  program.parse();
}
async function prepare() {
  // 第一步检查版本号
  checkPkgVersion();
}
function checkPkgVersion() {
  Logger.verbose(`${NAME}@${VERSION}`);
  checkUpdate({ name: NAME, version: VERSION });
}
export { registerCleanCommand } from './commands/registerCleanCommand.mjs';
export { default as CleanAction } from './actions/CleanAction.mjs';
export default async function core() {
  startTimestamp = Date.now();
  try {
    await prepare();
    // 命令注册
    registerCommand();
  } catch (e) {
    Logger.error(e.message);
    exitProcess(1, startTimestamp);
  }
}
