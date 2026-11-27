import { Command } from 'commander';
import chalk from 'chalk';
import { exitProcess, checkUpdate, setLoggerHeading, Logger } from '@git-ai/shared';
import { InitAction, registerCommitCommand } from '@git-ai/core';
import { registerCleanCommand } from '@git-ai/clean';
import { registerGpgCommand } from '@git-ai/gpg';
import { BIN, VERSION, NAME } from './constants/package.mjs';

let startTimestamp;
function registerCommand() {
  const program = new Command();
  program.name(BIN).version(VERSION);
  // helpOption 需在注册子命令之前设置，子命令的 -h 说明才会继承该文案
  program.helpOption(
    '-h',
    chalk.cyan(`显示帮助信息 （baseURL、model、token 分别支持多个，英文逗号隔开）`)
  );
  setLoggerHeading(BIN);
  program.command('init').description(`初始化大模型相关配置`).action(InitAction);
  registerCleanCommand(program);
  registerGpgCommand(program, BIN);
  registerCommitCommand(program, { withInit: false });
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
