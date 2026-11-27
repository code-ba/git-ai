import { Command } from 'commander';
import { exitProcess, checkUpdate, setLoggerHeading, Logger } from '@git-ai/shared';
import { BIN, VERSION, NAME } from './constants/package.mjs';
import { registerCommitCommand } from './commands/registerCommitCommand.mjs';

let startTimestamp;
function registerCommand() {
  const program = new Command();
  program.name(BIN).version(VERSION);
  setLoggerHeading(BIN);
  registerCommitCommand(program, { withInit: true });
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
export { registerCommitCommand };
export { default as InitAction } from './actions/InitAction.mjs';
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
