import chalk from 'chalk';
import { config, GPG_AUTO_COMMIT_SIGN } from '@git-ai/shared';
import GpgAction from '../actions/GpgAction.mjs';

export function registerGpgOptions(command, cmdPath) {
  // 签名提交默认值：先从本地存储取，本地没数据再取 constants/gpg.mjs 默认值
  // 等价于 ?? ：仅未设置（null/undefined）时取默认值，false 是合法值不能被覆盖
  const storedAutoSign = config.get('autoSign');
  const autoSignDefault = storedAutoSign == null ? GPG_AUTO_COMMIT_SIGN : storedAutoSign;
  return command
    .option('--create', '创建 GPG 密钥并导出公钥；未检测到全局默认签名密钥时自动设为默认')
    .option('--list', '查看本机 GPG 密钥列表')
    .option('--export', '选择密钥导出公钥或私钥')
    .option('--delete', '选择密钥删除（公钥+私钥）')
    .option(
      '--default [fingerprint]',
      '设置默认签名密钥；带指纹或 key ID 则直接设置，不带则从列表选择'
    )
    .option(
      '--local-default [fingerprint]',
      '为当前项目指定签名密钥；带指纹或 key ID 则直接设置，不带则从列表选择'
    )
    .option(
      '--local-empty [path]',
      '清空项目的签名密钥；带项目路径则直接清空，不带则从设置过的项目中选择'
    )
    .option(
      '--auto-sign [boolean]',
      // -s/--sign 与 --noSign 是 git ai 提交命令的参数，文案固定写 git ai；设置示例随入口变化
      `是否开启签名提交：git ai 未加 -s/--sign 时自动加上 --sign\n需要临时跳过签名执行${chalk.cyan(
        '`git ai --noSign`'
      )}\n设置示例：${chalk.cyan('`' + cmdPath + ' --auto-sign true`')}`,
      (value) => (typeof value === 'boolean' ? value : String(value) === 'true'),
      autoSignDefault
    );
}

export function registerGpgCommand(program, bin) {
  const gpg = program
    .command('gpg')
    .description(`GPG 密钥管理，查看指令参数：${chalk.cyan('`' + bin + ' gpg -h`')}`);
  registerGpgOptions(gpg, `${bin} gpg`).action(GpgAction);
}
