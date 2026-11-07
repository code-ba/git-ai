import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import Logger from '../utils/Logger.mjs';
import BaseAction from './BaseAction.mjs';
import { GPG_EXPORT_DIR, GPG_GIT_HOSTS, GPG_ALGORITHMS } from '../const.mjs';
import { config } from '../utils/Storage.mjs';

// git 地址下拉选项中手动输入的标识值
const CUSTOM_HOST = '__custom__';

// gpg pubkey algo 编号 → 算法名（ed25519 单独处理，与 --create 的命名保持一致）
const ALGO_NAMES = { 1: 'rsa', 2: 'dsa', 16: 'elg', 18: 'ecdh', 19: 'ecdsa' };

/**
 * 格式化时间戳：年月日_时分秒，如 20261106_064512
 */
const formatTimestamp = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

/**
 * 格式化日期：年-月-日，如 2026-11-06
 */
const formatDate = (seconds) => {
  const date = new Date(seconds * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * 算法展示名：ed25519 / rsa3072（与 --create 的命名保持一致）
 */
const formatAlgo = (algo, keyLength) =>
  algo === 22 ? 'ed25519' : `${ALGO_NAMES[algo] || `algo${algo}`}${keyLength}`;

/**
 * 解析 gpg --with-colons --with-keygrip 输出，返回主密钥列表（不含子密钥）
 * @param {string} recordType - 'pub' 公钥列表（--list-keys）/ 'sec' 签名密钥列表（--list-secret-keys，仅有私钥的密钥）
 * 每项：{ fingerprint, keygrip, algo, keyLength, created, uid }
 */
const listGpgKeys = (recordType = 'pub') => {
  let out = '';
  try {
    out = execFileSync(
      'gpg',
      [
        '--quiet',
        '--with-colons',
        '--with-keygrip',
        recordType === 'sec' ? '--list-secret-keys' : '--list-keys',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch (error) {
    return [];
  }
  const keys = [];
  let current = null;
  out.split(/\r?\n/).forEach((line) => {
    const parts = line.split(':');
    if (parts[0] === recordType) {
      current = {
        fingerprint: '',
        keygrip: '',
        algo: parseInt(parts[3], 10),
        keyLength: parseInt(parts[2], 10),
        created: parseInt(parts[5], 10),
        uid: '',
      };
      return;
    }
    if (!current) return;
    if (parts[0] === 'fpr' && !current.fingerprint) {
      current.fingerprint = parts[9];
    } else if (parts[0] === 'grp' && !current.keygrip) {
      current.keygrip = parts[9];
    } else if (parts[0] === 'uid' && !current.uid) {
      current.uid = parts[9];
    }
    if (current.fingerprint && current.keygrip && current.uid) {
      keys.push(current);
      current = null;
    }
  });
  return keys;
};

/**
 * 密钥列表行（带颜色和缩进）：缩进 序号(黄) 指纹(青) UID 算法(绿) 创建日期(灰)
 */
const formatKeyLine = (key, index) =>
  `  ${chalk.yellow(`${index + 1}.`)} ${chalk.cyan(key.fingerprint)}  ${key.uid}  ${chalk.green(
    formatAlgo(key.algo, key.keyLength)
  )}  ${chalk.gray(formatDate(key.created))}`;

/**
 * 从 UID 解析 Real name （name）、git 地址（括号内 comment）、邮箱（尖括号内 email）
 * 如 cxvh (github.com) <info@cxvh.com> → { realname: 'cxvh', gitHost: 'github.com', email: 'info@cxvh.com' }
 */
const parseUid = (uid) => {
  const nameMatch = uid.match(/^(.*?)\s*(?:\(|<)/);
  const commentMatch = uid.match(/\((.*?)\)/);
  const emailMatch = uid.match(/<([^>]*)>/);
  return {
    realname: nameMatch && nameMatch[1].trim() ? nameMatch[1].trim() : '',
    gitHost: commentMatch && commentMatch[1].trim() ? commentMatch[1].trim() : '',
    email: emailMatch && emailMatch[1].trim() ? emailMatch[1].trim() : '',
  };
};

/**
 * gpg 命令：
 *  --create 生成密钥并导出公钥；--list 查看密钥；--export 选择导出；--delete 选择删除
 */
class GpgAction extends BaseAction {
  /**
   * 读取 git 全局邮箱（git config --global user.email，未设置时返回空字符串）
   */
  getGitEmail() {
    try {
      return execFileSync('git', ['config', '--global', 'user.email'], {
        encoding: 'utf8',
      }).trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * 读取 git 全局签名密钥（git config --global user.signingkey，未设置时返回空字符串）
   */
  getGitSigningKey() {
    try {
      return execFileSync('git', ['config', '--global', 'user.signingkey'], {
        encoding: 'utf8',
      }).trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * 读取 git 本地签名密钥（git config --local user.signingkey，未设置时返回空字符串）
   */
  getGitLocalSigningKey() {
    try {
      return execFileSync('git', ['config', '--local', 'user.signingkey'], {
        encoding: 'utf8',
      }).trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * 从 git 全局配置提取 git 地址（credential.https://<host>.xxx 键中的 host，去重），
   * 如 credential.https://gitee.com.provider=generic → gitee.com
   */
  getGitGlobalHosts() {
    try {
      const out = execFileSync('git', ['config', '--global', '-l'], {
        encoding: 'utf8',
      });
      const hosts = [];
      out.split(/\r?\n/).forEach((line) => {
        const match = line.match(/^credential\.https:\/\/(.+)\.[^.=]+=/);
        if (match) hosts.push(match[1]);
      });
      return [...new Set(hosts)];
    } catch (error) {
      return [];
    }
  }

  /**
   * 提交邮箱：git config 已设置时 success 提示并直接采用（跳过输入），
   * 未设置时 warn 提示会自动设置，必填输入
   */
  async promptEmail(current) {
    if (current) {
      Logger.success(`已设置提交邮箱：${current}（git config --global user.email）`);
      return current;
    }
    Logger.warn(
      '未设置提交邮箱，生成完GPG密钥，会自动设置提交的邮箱（git config --global user.email）'
    );
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: '请输入提交邮箱',
        validate: (input) => ((input || '').trim() ? true : '提交邮箱不能为空'),
      },
    ]);
    return answers.email.trim();
  }

  /**
   * 输入 GPG 密钥密码：选填（允许为空，生成无密码密钥），输入框空值时灰色占位显示"选填"
   */
  async promptPassphrase() {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'passphrase',
        message: '请输入 GPG 密钥密码：',
        transformer: (value) =>
          value ? value : chalk.gray('选填，不建议设置，每次 commit 签名都要输入密码'),
      },
    ]);
    return answers.passphrase.trim();
  }

  /**
   * 选择 git 地址：下拉选择，选中"其他"时进入手动输入
   */
  async promptGitHost() {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'gitHost',
        message: '请选择 git 地址',
        choices: GPG_GIT_HOSTS,
        default: GPG_GIT_HOSTS[0].value,
        loop: false,
      },
    ]);
    if (answers.gitHost !== CUSTOM_HOST) return answers.gitHost;
    const custom = await inquirer.prompt([
      {
        type: 'input',
        name: 'gitHost',
        message: '请输入 git 地址',
        validate: (input) => ((input || '').trim() ? true : 'git 地址不能为空'),
      },
    ]);
    return custom.gitHost.trim();
  }

  /**
   * 明文输入一项信息（用户名 / 邮箱 / 密码）
   */
  async promptText(name, label) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name,
        message: `请输入${label}`,
        transformer: (value) => (value ? value : chalk.gray('无实际作用，理解为备注')),
        validate: (input) => ((input || '').trim() ? true : `${label.trim()}不能为空`),
      },
    ]);
    return answers[name].trim();
  }

  /**
   * 选择加密方式
   */
  async promptAlgorithm() {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'algorithm',
        message: '请选择加密方式',
        choices: GPG_ALGORITHMS,
        default: GPG_ALGORITHMS[0].value,
        loop: false,
      },
    ]);
    return answers.algorithm;
  }

  /**
   * 从密钥列表中选择一个密钥，返回主密钥指纹
   * 选项单行展示（指纹取前 8 位），避免多行选项在 inquirer list 滚动时渲染错位
   * @param {Function} [markMatch] - 可选，命中时选项末尾追加标注，如 (key) => parseUid(key.uid).email === 'xxx'
   * @param {string} [markText] - 标注文案，默认（默认）
   * @param {string} [defaultFingerprint] - 可选，默认选中的密钥指纹（光标默认停在该项）
   */
  async promptKey(keys, message, markMatch, markText = '（默认）', defaultFingerprint) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'fingerprint',
        message,
        choices: keys.map((key, index) => ({
          value: key.fingerprint,
          name: `${index + 1}. ${chalk.cyan(key.fingerprint.slice(0, 8))}  ${
            key.uid
          }  ${chalk.green(formatAlgo(key.algo, key.keyLength))}  ${chalk.gray(
            formatDate(key.created)
          )}${markMatch && markMatch(key) ? markText : ''}`,
        })),
        default: defaultFingerprint,
        loop: false,
      },
    ]);
    return answers.fingerprint;
  }

  /**
   * 复制内容到系统剪贴板（Windows: clip / macOS: pbcopy / Linux: xclip）
   * @returns {boolean} 是否复制成功
   */
  copyToClipboard(content) {
    try {
      if (process.platform === 'win32') {
        execFileSync('clip', { input: content });
      } else if (process.platform === 'darwin') {
        execFileSync('pbcopy', { input: content });
      } else {
        execFileSync('xclip', ['-selection', 'clipboard'], { input: content });
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 导出 armor 内容到 ~/.config/git-ai/cli/gpg，展示内容并自动复制到剪贴板，展示完整路径
   */
  exportAndShow(content, fileName) {
    const exportDir = join(homedir(), GPG_EXPORT_DIR);
    mkdirSync(exportDir, { recursive: true });
    const filePath = join(exportDir, fileName);
    writeFileSync(filePath, content);
    const copied = this.copyToClipboard(content.trim());
    Logger.info(
      copied
        ? `公钥已复制到剪贴板，直接粘贴到 git 仓库的 GPG 公钥设置：\n${chalk.bgCyan(
            content.trim()
          )}`
        : `复制以下公钥到 git 仓库的 GPG 公钥：\n${chalk.bgCyan(content.trim())}`
    );
    Logger.success(`已导出: ${filePath}`);
    return filePath;
  }

  /**
   * 将指定指纹设为默认签名密钥，防止同邮箱存在多个密钥时签名选错密钥报错：
   *  1. git 全局签名密钥：git config --global user.signingkey <指纹>
   *  2. gpg 层默认密钥：~/.gnupg/gpg.conf 写入 default-key <指纹>（已有则替换，其余内容保留）
   */
  setDefaultKey(fingerprint) {
    execFileSync('git', ['config', '--global', 'user.signingkey', fingerprint], {
      stdio: 'ignore',
    });
    const gpgConfPath = join(homedir(), '.gnupg', 'gpg.conf');
    let lines = [];
    try {
      lines = readFileSync(gpgConfPath, 'utf8').split(/\r?\n/);
    } catch (error) {
      // gpg.conf 不存在时从空配置开始
    }
    const kept = lines.filter((line) => !/^\s*default-key\s/.test(line));
    kept.push(`default-key ${fingerprint}`);
    writeFileSync(gpgConfPath, `${kept.join('\n')}\n`);
    Logger.success(
      `已设为默认签名密钥（git user.signingkey + gpg.conf default-key）: ${fingerprint}`
    );
  }

  /**
   * --create：选择 git 地址（可手动输入）→ 明文输入用户名/邮箱/密码 → 选择加密方式 → 生成并导出公钥
   */
  async executeCreate() {
    // 邮箱放第一位：git config 已设置 user.email 则回显（回车保持当前值），否则输入
    const gitEmail = this.getGitEmail();
    const email = await this.promptEmail(gitEmail);
    const gitHost = await this.promptGitHost();
    const realname = await this.promptText('realname', '真实姓名(Real name)');
    const passphrase = await this.promptPassphrase();
    const algorithm = await this.promptAlgorithm();

    // 生成前记录该邮箱已有主密钥指纹，生成后取差集得到新密钥指纹，
    // 用指纹精确导出，避免同邮箱旧密钥混入导出文件
    const before = listGpgKeys()
      .filter((key) => key.uid.includes(email))
      .map((key) => key.fingerprint);
    try {
      execFileSync(
        'gpg',
        [
          '--quiet',
          '--batch',
          '--pinentry-mode',
          'loopback',
          '--passphrase',
          passphrase,
          '--quick-generate-key',
          `${realname} (${gitHost}) <${email}>`,
          algorithm,
          'default',
          '0',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (error) {
      // 生成失败时展示 gpg 的真实报错（stderr），便于定位
      throw new Error(`GPG 密钥生成失败：${(error.stderr || error.message || '').trim()}`);
    }
    const fingerprint = listGpgKeys()
      .filter((key) => key.uid.includes(email))
      .map((key) => key.fingerprint)
      .find((f) => !before.includes(f));
    if (!fingerprint) throw new Error('未找到新生成的 GPG 密钥');

    // 生成完 gpg：仅当 git config 未设置提交邮箱时，才自动设置
    if (!gitEmail) {
      execFileSync('git', ['config', '--global', 'user.email', email], {
        stdio: 'ignore',
      });
      Logger.success(`已设置提交邮箱：${email}（git config --global user.email）`);
    }

    const publicKey = execFileSync('gpg', ['--quiet', '--armor', '--export', fingerprint], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    this.exportAndShow(publicKey, `${realname}_${gitHost}_${algorithm}_${formatTimestamp()}.asc`);
    this.setDefaultKey(fingerprint);
  }

  /**
   * --list：展示列表数据来源（gpg 密钥库目录，~ 表示用户主目录，即 ~\.gnupg），
   * 然后展示密钥列表（序号 + 指纹 + UID + 算法/长度 + 创建日期，不含子密钥）
   */
  async executeList() {
    const keys = listGpgKeys();
    if (!keys.length) {
      Logger.warn('未找到 GPG 密钥');
      return;
    }
    // 列表数据来源：gpg 密钥库吊销证书目录（gpgconf --list-dirs homedir），~ 表示用户主目录，
    // 目录里面的 .rev 文件以密钥指纹命名，与列表密钥一一对应
    const gpgHome = execFileSync('gpgconf', ['--list-dirs', 'homedir'], {
      encoding: 'utf8',
    }).trim();
    const msysHome = `/${homedir().charAt(0).toLowerCase()}${homedir()
      .slice(2)
      .replace(/\\/g, '/')}`;
    const displayHome = gpgHome.replace(msysHome, '~').replace(/\//g, '\\');
    const keyDir = `${displayHome}\\openpgp-revocs.d`;
    Logger.info(`密钥所在目录: ${chalk.cyan(keyDir)}`);
    Logger.info(
      `所有密钥如下: \n${keys.map((key, index) => formatKeyLine(key, index)).join('\n')}`
    );
  }

  /**
   * --export：选择密钥 → 选择导出公钥或私钥 → 导出到 ~/.config/git-ai/cli/gpg 并展示
   * 文件名沿用 --create 规则：{用户名}_{git地址}_{算法}_{时间戳}.asc，
   * 用户名/git 地址从 UID 解析，解析不出时用指纹前 8 位替代
   */
  async executeExport() {
    const keys = listGpgKeys();
    if (!keys.length) {
      Logger.warn('未找到 GPG 密钥');
      return;
    }
    const fingerprint = await this.promptKey(keys, '请选择要导出的密钥');
    const key = keys.find((k) => k.fingerprint === fingerprint);
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'keyType',
        message: '请选择导出内容',
        choices: [
          { value: 'pub', name: '公钥（默认）' },
          { value: 'secret', name: '私钥' },
        ],
        default: 'pub',
        loop: false,
      },
    ]);
    const isSecret = answers.keyType === 'secret';
    const content = execFileSync(
      'gpg',
      ['--quiet', '--armor', isSecret ? '--export-secret-keys' : '--export', fingerprint],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const { realname, gitHost } = parseUid(key.uid);
    const fallback = fingerprint.slice(0, 8);
    this.exportAndShow(
      content,
      `${realname || fallback}_${gitHost || fallback}_${formatAlgo(
        key.algo,
        key.keyLength
      )}_${formatTimestamp()}.asc`
    );
  }

  /**
   * --delete：选择密钥 → 二次确认 → 删除公钥+私钥
   */
  async executeDelete() {
    const keys = listGpgKeys();
    if (!keys.length) {
      Logger.warn('未找到 GPG 密钥');
      return;
    }
    const fingerprint = await this.promptKey(keys, '请选择要删除的密钥');
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: '确认删除该密钥的公钥+私钥？删除后不可恢复',
        default: false,
      },
    ]);
    if (!answers.confirmed) {
      Logger.warn('已取消删除');
      return;
    }
    execFileSync(
      'gpg',
      ['--quiet', '--batch', '--yes', '--delete-secret-and-public-key', fingerprint],
      { stdio: 'ignore' }
    );
    Logger.success(`已删除: ${fingerprint}`);
  }

  /**
   * 从字符串选项列表中选择一项
   */
  async promptFromList(options, message) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'value',
        message,
        choices: options,
        loop: false,
      },
    ]);
    return answers.value;
  }

  /**
   * --default：设置默认签名密钥，逐步定位：
   * 选择 git 地址（已有签名密钥 UID 中的 git 地址）→ 选择邮箱 →
   * 展示过滤后的签名密钥列表选择（git 地址在全局配置中且邮箱为全局 user.email 的密钥标注（默认））→
   * 设为默认（git user.signingkey + gpg.conf default-key）
   */
  async executeDefault() {
    const secretKeys = listGpgKeys('sec');
    if (!secretKeys.length) {
      Logger.warn('未找到可签名的 GPG 密钥（无私钥）');
      return;
    }
    const uids = secretKeys.map((key) => parseUid(key.uid));

    // 全局默认：git config --global 的 user.email + credential.https://<host>.* 中的 git 地址
    const globalEmail = this.getGitEmail();
    const globalHosts = this.getGitGlobalHosts();

    const gitHosts = [...new Set(uids.map((uid) => uid.gitHost).filter(Boolean))];
    if (!gitHosts.length) {
      Logger.warn('未找到包含 git 地址的签名密钥');
      return;
    }
    const gitHost = await this.promptFromList(gitHosts, '请选择 git 地址');

    const matchedByHost = uids.filter((uid) => uid.gitHost === gitHost);
    const emails = [...new Set(matchedByHost.map((uid) => uid.email).filter(Boolean))];
    if (!emails.length) {
      Logger.warn('未找到包含邮箱的签名密钥');
      return;
    }
    const email = await this.promptFromList(emails, '请选择邮箱');

    const matched = secretKeys.filter((key) => {
      const uid = parseUid(key.uid);
      return uid.gitHost === gitHost && uid.email === email;
    });
    const fingerprint = await this.promptKey(matched, '请选择要设为默认的签名密钥', (key) => {
      const uid = parseUid(key.uid);
      return globalHosts.includes(uid.gitHost) && uid.email === globalEmail;
    });
    this.setDefaultKey(fingerprint);
  }

  /**
   * --local-default：为当前项目指定签名密钥，拉出所有可签名密钥列表选择，
   * git config --local user.signingkey <指纹>
   * 本地已设置时列表标注（当前）并默认选中；本地密钥已被删除时提示后重新选择
   */
  async executeLocalDefault() {
    const secretKeys = listGpgKeys('sec');
    if (!secretKeys.length) {
      Logger.warn('未找到可签名的 GPG 密钥（无私钥）');
      return;
    }
    const localKey = this.getGitLocalSigningKey();
    let markMatch;
    let defaultFingerprint;
    if (localKey) {
      const current = secretKeys.find((key) => key.fingerprint.endsWith(localKey));
      if (current) {
        markMatch = (key) => key.fingerprint === current.fingerprint;
        defaultFingerprint = current.fingerprint;
      } else {
        Logger.warn(`本地已设置的签名密钥不存在（可能已被删除）: ${localKey}，请重新选择`);
      }
    }
    const fingerprint = await this.promptKey(
      secretKeys,
      '请选择要设为当前项目的签名密钥',
      markMatch,
      '（当前）',
      defaultFingerprint
    );
    execFileSync('git', ['config', '--local', 'user.signingkey', fingerprint], {
      stdio: 'ignore',
    });
    Logger.success(`已设为当前项目签名密钥（git config --local user.signingkey）: ${fingerprint}`);
  }

  async execute() {
    if (this.args.create) await this.executeCreate();
    else if (this.args.list) await this.executeList();
    else if (this.args.export) await this.executeExport();
    else if (this.args.delete) await this.executeDelete();
    else if (this.args.default) await this.executeDefault();
    else if (this.args.localDefault) await this.executeLocalDefault();
    else this.args.command.help();
  }
}

export default async function (options = {}, command = {}) {
  const keys = Object.keys(options);
  if (keys.length === 1) {
    // autoSign 解析值写入本地存储，供下次默认值取用
    config.set('autoSign', options.autoSign);
    Logger.success(`自动检测签名：${options.autoSign ? '已开启' : '已关闭'}`);
  } else {
    const action = new GpgAction({ ...options, command });
    await action.run();
  }
}
