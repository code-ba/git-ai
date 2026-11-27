import { Command } from 'commander';
import chalk from 'chalk';
import { exitProcess, checkUpdate, setLoggerHeading, Logger } from '@git-ai/shared';
import { BIN, VERSION, NAME } from './constants/package.mjs';
import GpgAction from './actions/GpgAction.mjs';
import { registerGpgOptions } from './commands/registerGpgCommand.mjs';

let startTimestamp;
function registerCommand() {
  const program = new Command();
  program.name(BIN).version(VERSION);
  setLoggerHeading(BIN);
  registerGpgOptions(
    program.description(`GPG 密钥管理，查看指令参数：${chalk.cyan('`' + BIN + ' -h`')}`),
    BIN
  ).action(GpgAction);
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
export { registerGpgCommand, registerGpgOptions } from './commands/registerGpgCommand.mjs';
export { default as GpgAction } from './actions/GpgAction.mjs';
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
