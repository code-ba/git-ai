import chalk from 'chalk';
import CommitAction from '../actions/CommitAction.mjs';
import InitAction from '../actions/InitAction.mjs';
import { BIN, DESCRIPTION } from '../constants/package.mjs';
import { asciiArt } from '../constants/banner.mjs';

export function registerCommitCommand(program, { withInit }) {
  program
    .helpOption(
      '-h',
      chalk.cyan(`显示帮助信息 （baseURL、model、token 分别支持多个，英文逗号隔开）`)
    )
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
      '-p, --pickSign',
      `提交时从私钥列表中选择签名密钥（等同于 ${chalk.cyan('`git commit -S<指纹>`')}）`
    )
    .option(
      '--noSign',
      `提交时 commit 跳过签名（等同于 ${chalk.cyan(
        '`git commit --no-gpg-sign`'
      )}）\n使用场景：git 全局开启了自动签名 ${chalk.cyan(
        '`commit.gpgsign`'
      )}，或脚手架开启了签名提交`
    )
    .option(
      '-m, --commit',
      `commit 完成后停止，不再执行 ${chalk.cyan('`git fetch`')} / ${chalk.cyan(
        '`git merge`'
      )} / ${chalk.cyan('`git push`')}`
    );
  if (withInit) {
    program.option('--init', `初始化大模型相关配置`);
  }
  program
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
    .action(async (args) => {
      if (withInit && args.init) {
        await InitAction();
        return;
      }
      await CommitAction(args);
    });
}
