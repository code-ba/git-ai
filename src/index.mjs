import { Command } from 'commander';
import CommitAction from './actions/CommitAction.mjs';
import ModelAction from './actions/ModelAction.mjs';
import TokenAction from './actions/TokenAction.mjs';
import BaseUrlAction from './actions/BaseUrlAction.mjs';
import MaxTokenAction from './actions/MaxTokenAction.mjs';
import { exitProcess } from './utils/Utils.mjs';
import { BIN, VERSION, DESCRIPTION, NAME, OPENAI_MAX_TOKEN_DEFAULT, asciiArt } from './const.mjs';
import Logger from './utils/Logger.mjs';
import chalk from 'chalk';

let startTimestamp;
function registerCommand() {
  const program = new Command();
  program
    .name(BIN)
    .version(VERSION)
    .helpOption(
      '-h',
      chalk.cyan(`显示帮助信息 （baseURL、model、token 分别支持多个，英文逗号隔开）`)
    );
  program
    .command('set-baseURL [baseURL]')
    .description(
      `设置 OpenAI compatible Base URL，请执行 ${chalk.cyan(
        '`' + BIN + ' set-baseURL [baseURL]`'
      )}\n如：https://api.siliconflow.cn/v1`
    )
    .action(BaseUrlAction);
  program
    .command('set-key [key]')
    .description(
      `设置 OpenAI compatible Api Key，请执行 ${chalk.cyan('`' + BIN + ' set-key [key]`')}`
    )
    .action(TokenAction);
  program
    .command('set-model [model]')
    .description(`设置您的模型，请执行 ${chalk.cyan('`' + BIN + ' set-model [model]`')}`)
    .action(ModelAction);
  program
    .command('set-max-token <maxToken>')
    .description(
      `设置您的最大 token 数，默认：${OPENAI_MAX_TOKEN_DEFAULT}(${Math.round(
        OPENAI_MAX_TOKEN_DEFAULT / 1000
      )}k)`
    )
    .action(MaxTokenAction);
  program
    .option('-e, --allowEmpty', `等同于 ${chalk.cyan('`git commit --allow-empty -m <message>`')}`)
    .option('-n, --noVerify', `等同于 ${chalk.cyan('`git commit --no-verify -m <message>`')}`)
    .option(
      '-s, --skip',
      `跳过 ${chalk.cyan('`git add`')} 命令, 只提交已暂存的更改，如：${chalk.cyan(
        '`' + BIN + ' --skip`'
      )}`
    )
    .description(
      `${DESCRIPTION}\n${asciiArt}\n使用 AI 自动生成提交信息并推送
   → ${chalk.cyan('检查环境')} → ${chalk.cyan('检查目录')} → ${chalk.cyan(
        '检查冲突'
      )} → ${chalk.cyan('处理合并')}\n   → ${chalk.cyan('git add')} → ${chalk.cyan(
        '获取diff'
      )} → ${chalk.cyan('AI 生成 commit message')}\n   → ${chalk.cyan('git fetch')} → ${chalk.cyan(
        'git merge'
      )} → ${chalk.cyan('检查冲突')} → ${chalk.cyan('git push')}`
    )
    .action(CommitAction);
  program.parse();
}
async function prepare() {
  // 第一步检查版本号
  checkPkgVersion();
}
function checkPkgVersion() {
  Logger.verbose(`${NAME}@${VERSION}`);
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
