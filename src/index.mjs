import { Command } from 'commander';
import CommitAction from './actions/CommitAction.mjs';
import InitAction from './actions/InitAction.mjs';
import GpgAction from './actions/GpgAction.mjs';
import { exitProcess } from './utils/Utils.mjs';
import { BIN, VERSION, DESCRIPTION, NAME, asciiArt } from './const.mjs';
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
    .command('init')
    .description(
      `初始化配置（请求类型、baseURL、key、model、max-token），已配置的项会回显，回车保持当前值；model 从接口列表多选`
    )
    .action(InitAction);
  program
    .command('gpg')
    .description(
      `GPG 密钥管理，如：${chalk.cyan('`' + BIN + ' gpg --create`')}
   ${chalk.cyan(
     '--create'
   )}   创建密钥：输入邮箱（git config 已设置则回显）、选择 git 地址（可手动输入）、输入用户名/密码、选择加密方式，生成后导出公钥并设为默认签名密钥与 git config 邮箱
   ${chalk.cyan(
     '--list'
   )}     查看密钥：展示密钥目录与密钥列表（序号 + 指纹 + UID + 算法/长度 + 创建日期）
   ${chalk.cyan(
     '--export'
   )}   导出密钥：选择密钥后选择导出公钥或私钥（armor 格式），导出到密钥目录并展示
   ${chalk.cyan('--delete')}   删除密钥：选择密钥后二次确认，删除公钥+私钥
   ${chalk.cyan(
     '--default'
   )}  设默认签名密钥：依次选择 git 地址、邮箱、账号，从匹配的签名密钥列表中选择一个`
    )
    .option(
      '--create',
      `创建 GPG 密钥：输入邮箱（git config 已设置则回显，回车保持当前值）、选择 git 地址（可手动输入）、明文输入用户名/密码、选择加密方式，生成后自动导出公钥到 ${chalk.cyan(
        '`~/.config/git-ai/cli/gpg`'
      )} 并展示，并设为默认签名密钥（git user.signingkey + gpg.conf default-key）与 git config 邮箱`
    )
    .option('--list', '查看本机 GPG 密钥（序号 + 指纹 + UID + 算法/长度 + 创建日期，不含子密钥）')
    .option(
      '--export',
      `选择密钥导出：先选密钥，再选导出公钥或私钥（armor 格式），导出到 ${chalk.cyan(
        '`~/.config/git-ai/cli/gpg`'
      )} 并展示`
    )
    .option('--delete', '选择密钥删除：公钥+私钥一起删除，删除前二次确认')
    .option(
      '--default',
      '设置默认签名密钥：依次选择 git 地址、邮箱、账号，从匹配的签名密钥列表中选择一个设为默认（git user.signingkey + gpg.conf default-key）'
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
    .option(
      '-s, --sign',
      `提交时检查是否存在与 ${chalk.cyan(
        '`user.email`'
      )} 匹配的 GPG 私钥，有则签名提交（等同于 ${chalk.cyan('`git commit -S`')}），无则警告`
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
