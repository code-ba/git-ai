import { Command } from 'commander';
import CommitAction from './actions/CommitAction.mjs';
import InitAction from './actions/InitAction.mjs';
import GpgAction from './actions/GpgAction.mjs';
import CleanAction from './actions/CleanAction.mjs';
import { exitProcess, checkUpdate } from './utils/Utils.mjs';
import { BIN, VERSION, DESCRIPTION, NAME, asciiArt, GPG_AUTO_COMMIT_SIGN } from './const.mjs';
import { config } from './utils/Storage.mjs';
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
  program.command('init').description(`初始化大模型相关配置`).action(InitAction);
  program
    .command('clean')
    .description(`清理被 .gitignore 忽略却已提交的文件（本地文件保留）`)
    .action(CleanAction);
  // 自动签名默认值：先从本地存储取，本地没数据再取 const.mjs 默认值
  // 等价于 ?? ：仅未设置（null/undefined）时取默认值，false 是合法值不能被覆盖
  const storedAutoSign = config.get('autoSign');
  const autoSignDefault = storedAutoSign == null ? GPG_AUTO_COMMIT_SIGN : storedAutoSign;
  program
    .command('gpg')
    .description(`GPG 密钥管理，查看指令参数：${chalk.cyan('`' + BIN + ' gpg -h`')}`)
    .option('--create', '创建 GPG 密钥并导出公钥、设为默认签名密钥')
    .option('--list', '查看本机 GPG 密钥列表')
    .option('--export', '选择密钥导出公钥或私钥')
    .option('--delete', '选择密钥删除（公钥+私钥）')
    .option('--default', '设置默认签名密钥')
    .option('--local-default', '为当前项目指定签名密钥')
    .option(
      '--auto-sign [boolean]',
      `是否开启脚手架自动签名，等同于（${chalk.cyan(
        '`git commit -S`'
      )}）\n需要临时跳过签名执行${chalk.cyan('`' + BIN + ' --noSign`')}）\n设置示例：${chalk.cyan(
        '`' + BIN + ' gpg --auto-sign true`'
      )}`,
      (value) => (typeof value === 'boolean' ? value : String(value) === 'true'),
      autoSignDefault
    )
    .action(GpgAction);
  program
    .option('-e, --allowEmpty', `等同于 ${chalk.cyan('`git commit --allow-empty -m <message>`')}`)
    .option('-n, --noVerify', `等同于 ${chalk.cyan('`git commit --no-verify -m <message>`')}`)
    .option(
      '--noAdd',
      `跳过 ${chalk.cyan('`git add`')} 命令, 只提交已暂存的更改，如：${chalk.cyan(
        '`' + BIN + ' --noAdd`'
      )}`
    )
    .option('-s, --sign', `提交时对 commit 签名（等同于 ${chalk.cyan('`git commit -S`')}）`)
    .option(
      '--noSign',
      `提交时 commit 跳过签名（等同于 ${chalk.cyan(
        '`git commit --no-gpg-sign`'
      )}）\n使用场景：全局开启自动签名${chalk.cyan('`git config --global --get commit.gpgsign`')}`
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
  checkUpdate();
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
