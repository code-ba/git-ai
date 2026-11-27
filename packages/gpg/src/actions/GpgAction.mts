import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { BIN } from '../constants/package.mjs';
import {
  Logger,
  BaseAction,
  GitService,
  config,
  GPG_EXPORT_DIR,
  GPG_ALGORITHMS,
  parseUid,
  getGpgConfDefaultKey,
  getGitLocalSigningKey,
  findKeyBySigningKey,
  findGlobalSignKey,
  isSameSignKey,
  listGpgKeys,
  promptKey,
  formatFileName,
  formatTimestamp,
  formatAlgo,
  formatKeyLine,
} from '@git-ai/shared';

// 提交邮箱的基本格式校验（本地部分@域名.后缀）
const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 通过 --local-default 设置过项目密钥的项目记录（本地存储）：{ 项目根目录绝对路径: { fingerprint } }
const LOCAL_SIGN_PROJECTS = 'localSignProjects';
const getLocalSignProjects = () => config.get(LOCAL_SIGN_PROJECTS) || {};
const saveLocalSignProjects = (projects) => config.set(LOCAL_SIGN_PROJECTS, projects);

/**
 * gpg 命令：
 *  --create 生成密钥并导出公钥；--list 查看密钥；--export 选择导出；--delete 选择删除；
 *  --default [指纹/key ID] 设置全局默认签名密钥；--local-default [指纹/key ID] 为当前项目指定签名密钥；
 *  --local-empty [项目路径] 清空项目签名密钥；--auto-sign 开启或关闭签名提交
 */
class GpgAction extends BaseAction {
  gitService: GitService;

  constructor(args) {
    super(args);
    this.gitService = new GitService();
  }

  /**
   * 提交邮箱：git config 已设置时 success 提示并直接采用（跳过输入），
   * 未设置时 warn 提示会自动设置，必填输入
   */
  async promptEmail(current) {
    if (current) {
      // 已设置的邮箱直接采用，不做阻断；格式异常时提示可能无法通过平台验证
      if (!EMAIL_REGEXP.test(current)) {
        Logger.warn(`git 全局提交邮箱格式异常: ${current}，生成的密钥可能无法通过平台验证`);
      }
      Logger.success(`已设置提交邮箱：${current}（git config --global user.email）`);
      return current;
    }
    Logger.warn(
      '未设置提交邮箱，生成完 GPG 密钥，会自动设置提交的邮箱（git config --global user.email）'
    );
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: '请输入提交邮箱',
        validate: (input) =>
          EMAIL_REGEXP.test((input || '').trim()) ? true : '邮箱格式不正确，请输入有效邮箱',
      },
    ]);
    return answers.email.trim();
  }

  /**
   * 输入 GPG 密钥密码：选填（允许为空，生成无密码密钥），输入内容以 * 掩码显示
   */
  async promptPassphrase() {
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'passphrase',
        message: '请输入 GPG 密钥密码（选填，不建议设置，每次 commit 签名都要输入密码）：',
        mask: '*',
      },
    ]);
    return answers.passphrase.trim();
  }

  /**
   * 明文输入 Real name（选填）
   */
  async promptText(name, label) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name,
        message: `请输入${label}`,
        transformer: (value) => (value ? value : chalk.gray('理解为备注，仅标识密钥，不影响签名')),
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
   * @param {boolean} [isSecret=false] 是否私钥（影响提示文案，私钥不能引导粘贴到平台公钥设置）
   */
  exportAndShow(content, fileName, isSecret = false) {
    const exportDir = join(homedir(), GPG_EXPORT_DIR);
    mkdirSync(exportDir, { recursive: true });
    const filePath = join(exportDir, fileName);
    writeFileSync(filePath, content);
    const copied = this.copyToClipboard(content.trim());
    let tip;
    if (isSecret) {
      tip = copied
        ? '私钥已复制到剪贴板，请妥善保管，切勿粘贴到 git 仓库的 GPG 公钥设置'
        : '请妥善保管以下私钥，切勿粘贴到 git 仓库的 GPG 公钥设置';
    } else {
      tip = copied
        ? '公钥已复制到剪贴板，直接粘贴到 git 仓库的 GPG 公钥设置'
        : '复制以下公钥到 git 仓库的 GPG 公钥';
    }
    Logger.info(`${tip}：\n${chalk.bgCyan(content.trim())}`);
    Logger.success(`已导出: ${filePath}`);
    return filePath;
  }

  /**
   * 将指定指纹设为全局默认签名密钥，防止同邮箱存在多个密钥时签名选错密钥报错：
   * 只写 git 全局签名密钥 git config --global user.signingkey <指纹>，不改动 gpg.conf
   * （git 优先使用 user.signingkey；gpg.conf 的 default-key 指向另一把密钥时，设置后给出警告）
   * @param {boolean} [silent=false] 为 true 时不打印日志（--create 自行打印带指令的提示）
   */
  setDefaultKey(fingerprint, silent = false) {
    execFileSync('git', ['config', '--global', 'user.signingkey', fingerprint], {
      stdio: 'ignore',
    });
    if (silent) return;
    const message = `已设为默认签名密钥:\n${chalk.cyan(
      `git config --global user.signingkey ${fingerprint}`
    )}`;
    // gpg.conf 的 default-key 指向另一把密钥时才提示，与本次设置的密钥相同则没有歧义
    const gpgConfKey = getGpgConfDefaultKey();
    if (gpgConfKey && !isSameSignKey(listGpgKeys('sec'), gpgConfKey, fingerprint)) {
      Logger.warn(`${message}\ngpg.conf 的全局密钥无效:\ndefault-key ${chalk.cyan(gpgConfKey)}`);
      return;
    }
    Logger.success(message);
  }

  /**
   * --create：明文输入邮箱/Real name/密码 → 选择加密方式 → 生成并导出公钥
   * 全局默认签名密钥不存在时自动把新密钥设为默认；
   * 已存在则不覆盖，提示执行 gpg --default（设为全局默认）或 gpg --local-default（仅当前项目使用）
   */
  async executeCreate() {
    // 邮箱放第一位：git config 已设置 user.email 则直接采用（不出现输入框），否则输入
    const gitEmail = this.gitService.getUserEmail();
    const email = await this.promptEmail(gitEmail);
    const realname = await this.promptText('realname', 'Real name');
    const passphrase = await this.promptPassphrase();
    const algorithm = await this.promptAlgorithm();

    // 生成前记录该邮箱已有主密钥指纹，生成后取差集得到新密钥指纹，
    // 用指纹精确导出，避免同邮箱旧密钥混入导出文件
    const before = listGpgKeys()
      .filter((key) => key.uid.includes(email))
      .map((key) => key.fingerprint);
    // 生成前检测是否已有全局生效的签名密钥（须在本机私钥列表中存在），决定生成后是否自动设为默认
    const defaultKey = findGlobalSignKey(listGpgKeys('sec'));
    try {
      execFileSync(
        'gpg',
        [
          '--quiet',
          '--batch',
          '--pinentry-mode',
          'loopback',
          // 密码经 stdin 传入（gpg 只读第一行），避免出现在进程命令行中被 ps/任务管理器读到
          '--passphrase-fd',
          '0',
          '--quick-generate-key',
          realname ? `${realname} <${email}>` : `<${email}>`,
          algorithm,
          'default',
          '0',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], input: `${passphrase}\n` }
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
      Logger.success(`设置提交邮箱，已执行指令：git config --global user.email ${email}`);
    }

    const publicKey = execFileSync('gpg', ['--quiet', '--armor', '--export', fingerprint], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    this.exportAndShow(
      publicKey,
      `${formatFileName(realname) || fingerprint.slice(0, 8)}_${algorithm}_${formatTimestamp()}.asc`
    );
    if (!defaultKey) {
      this.setDefaultKey(fingerprint, true);
      Logger.warn(
        `未检测到全局默认签名密钥，自动设置新密钥为全局默认，等同于执行：\n${chalk.cyan(
          `${BIN} gpg --default ${fingerprint}`
        )}`
      );
      return;
    }
    Logger.info(
      `检测到全局默认签名密钥:\n${chalk.cyan(defaultKey.fingerprint)}  ${defaultKey.uid}`
    );
    Logger.warn(
      `新密钥未设为默认，如需设置请执行:\n${chalk.cyan(`${BIN} gpg --default ${fingerprint}`)}`
    );
    Logger.warn(
      `仅当前项目使用新密钥，请执行:\n${chalk.cyan(`${BIN} gpg --local-default ${fingerprint}`)}`
    );
  }

  /**
   * --list：展示列表数据来源（gpg 密钥库目录，~ 表示用户主目录，即 ~\.gnupg），
   * 然后展示密钥列表（序号 + 指纹 + UID + 算法/长度 + 创建日期，不含子密钥），全局生效的签名密钥行尾标注（默认）
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
    const globalKey = findGlobalSignKey(keys);
    Logger.info(
      `所有密钥如下: \n${keys
        .map((key, index) =>
          formatKeyLine(key, index, !!globalKey && key.fingerprint === globalKey.fingerprint)
        )
        .join('\n')}`
    );
  }

  /**
   * --export：选择密钥 → 选择导出公钥或私钥 → 导出到 ~/.config/git-ai/cli/gpg 并展示
   * 文件名沿用 --create 规则：{Real name}_{算法}_{时间戳}.asc，
   * Real name 从 UID 解析，解析不出时用指纹前 8 位替代
   */
  async executeExport() {
    const keys = listGpgKeys();
    if (!keys.length) {
      Logger.warn('未找到 GPG 密钥');
      return;
    }
    const fingerprint = await promptKey(keys, '请选择要导出的密钥');
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
    const { realname } = parseUid(key.uid);
    const fallback = fingerprint.slice(0, 8);
    this.exportAndShow(
      content,
      `${formatFileName(realname) || fallback}_${formatAlgo(
        key.algo,
        key.keyLength
      )}_${formatTimestamp()}.asc`,
      isSecret
    );
  }

  /**
   * --delete：选择密钥 → 二次确认 → 删除公钥+私钥，不改动全局配置；
   * 删除的是全局生效的签名密钥时，确认前警告、删除后提示：
   *  gpg.conf 的 default-key 指向另一把可用密钥 → 删除后 -s 回退到它，不会失败
   *  否则 → -s 会失败，需执行 gpg --default 重新设置；gpg.conf 的 default-key 仍指向被删密钥时一并提示；
   *  通过 --local-default 使用该密钥的项目，删除后同步清空其项目配置和本地记录
   */
  async executeDelete() {
    const keys = listGpgKeys();
    if (!keys.length) {
      Logger.warn('未找到 GPG 密钥');
      return;
    }
    const fingerprint = await promptKey(keys, '请选择要删除的密钥');
    const globalKey = findGlobalSignKey(keys);
    const isDefault = !!globalKey && globalKey.fingerprint === fingerprint;
    const gpgConfKey = getGpgConfDefaultKey();
    const gpgConfTarget = gpgConfKey ? findKeyBySigningKey(listGpgKeys('sec'), gpgConfKey) : null;
    const isGpgConfDeleted = !!gpgConfTarget && gpgConfTarget.fingerprint === fingerprint;
    // 删完之后 gpg.conf 里是否还有另一把可用的密钥：有则 -s 回退到它
    const hasGpgConfFallback =
      isDefault && !!gpgConfTarget && gpgConfTarget.fingerprint !== fingerprint;
    // 删的是默认签名密钥时先警告，用户仍可在下一步取消
    if (isDefault) {
      Logger.warn(
        `该密钥是当前默认签名密钥，删除后 ${chalk.cyan(`${BIN} -s`)} ${
          hasGpgConfFallback ? '将改用 gpg.conf 的 default-key' : '签名提交会失败'
        }`
      );
    }
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
    // --delete 只删密钥不清配置：user.signingkey / gpg.conf 仍指向已删指纹
    if (isDefault && !hasGpgConfFallback) {
      Logger.warn(
        `已删除的是默认签名密钥，请执行 ${chalk.cyan(`${BIN} gpg --default`)} 重新设置默认签名密钥`
      );
    }
    if (isGpgConfDeleted) {
      Logger.warn(
        `gpg.conf 的 default-key 仍指向已删除的密钥:\ndefault-key ${chalk.cyan(gpgConfKey)}`
      );
    } else if (hasGpgConfFallback) {
      Logger.warn(
        `已删除的是默认签名密钥，将改用 gpg.conf 的 default-key:\ndefault-key ${chalk.cyan(
          gpgConfKey
        )}`
      );
    } else if (isDefault && gpgConfKey) {
      Logger.warn(`还存在另一个全局密钥配置（gpg.conf）:\ndefault-key ${chalk.cyan(gpgConfKey)}`);
    }
    // 通过 --local-default 使用该密钥的项目：逐个清空项目配置并移除记录（先取快照，清理过程会改动记录）
    const projects = getLocalSignProjects();
    Object.keys(projects).forEach((repoRoot) => {
      if (projects[repoRoot].fingerprint === fingerprint) this.clearLocalSignKey(repoRoot);
    });
  }

  /**
   * --default [指纹/key ID]：设置全局默认签名密钥（git config --global user.signingkey）
   *  带参数：直接设置指定的密钥（须在本机私钥列表中），不弹列表
   *  不带参数：展示全部可签名密钥（有私钥）列表选择
   */
  async executeDefault(signingKey) {
    const secretKeys = listGpgKeys('sec');
    if (!secretKeys.length) {
      Logger.warn('未找到可签名的 GPG 密钥（无私钥）');
      return;
    }
    // commander 对可选值的选项不带值时为 true，带值时为该字符串
    if (signingKey !== true) {
      const key = findKeyBySigningKey(secretKeys, signingKey);
      if (!key) throw new Error(`未找到该签名密钥: ${signingKey}`);
      this.setDefaultKey(key.fingerprint);
      return;
    }
    const fingerprint = await promptKey(secretKeys, '请选择要设为默认的签名密钥');
    this.setDefaultKey(fingerprint);
  }

  /**
   * --local-default [指纹/key ID]：为当前项目指定签名密钥，git config --local user.signingkey <指纹>
   *  带参数：直接设置指定的密钥（须在本机私钥列表中），不弹列表
   *  不带参数：拉出所有可签名密钥列表选择，
   *  本地已设置时（支持指纹/key ID/子密钥指纹/邮箱，大小写不敏感）列表标注（当前）并默认选中；
   *  本地密钥已被删除时提示后重新选择
   */
  async executeLocalDefault(signingKey) {
    // git config --local 仅在 git 仓库内可用，提前检查避免走完交互后写入才报错
    this.gitService.checkRepository();
    const secretKeys = listGpgKeys('sec');
    if (!secretKeys.length) {
      Logger.warn('未找到可签名的 GPG 密钥（无私钥）');
      return;
    }
    // commander 对可选值的选项不带值时为 true，带值时为该字符串
    if (signingKey !== true) {
      const key = findKeyBySigningKey(secretKeys, signingKey);
      if (!key) throw new Error(`未找到该签名密钥: ${signingKey}`);
      this.setLocalDefaultKey(key.fingerprint);
      return;
    }
    const localKey = getGitLocalSigningKey();
    let markMatch;
    let defaultFingerprint;
    if (localKey) {
      const current = findKeyBySigningKey(secretKeys, localKey);
      if (current) {
        markMatch = (key) => key.fingerprint === current.fingerprint;
        defaultFingerprint = current.fingerprint;
      } else {
        Logger.warn(`本地已设置的签名密钥不存在（可能已被删除）: ${localKey}，请重新选择`);
      }
    }
    const fingerprint = await promptKey(
      secretKeys,
      '请选择要设为当前项目的签名密钥',
      markMatch,
      '（当前）',
      defaultFingerprint
    );
    this.setLocalDefaultKey(fingerprint);
  }

  /**
   * 将指定指纹设为当前项目的签名密钥：git config --local user.signingkey <指纹>，
   * 并记录到本地存储（项目根目录 → 指纹），供 --delete 删除密钥时同步清理、--local-empty 列出选择
   */
  setLocalDefaultKey(fingerprint) {
    execFileSync('git', ['config', '--local', 'user.signingkey', fingerprint], {
      stdio: 'ignore',
    });
    const repoRoot = this.gitService.getRepoRoot();
    const projects = getLocalSignProjects();
    projects[repoRoot] = { fingerprint };
    saveLocalSignProjects(projects);
    Logger.success(
      `已设为当前项目签名密钥:\n${chalk.cyan(
        `git config --local user.signingkey ${fingerprint}`
      )}\n清除请执行:\n${chalk.cyan(`${BIN} gpg --local-empty ${repoRoot}`)}`
    );
  }

  /**
   * 清空指定项目的签名密钥（git config --local --unset user.signingkey），并移除本地存储中的记录
   * @returns {boolean} 项目配置是否已清空（目录不存在或不是 git 仓库时为 false，此时仅移除记录）
   */
  clearLocalSignKey(repoRoot) {
    try {
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: repoRoot,
        stdio: 'ignore',
      });
    } catch (error) {
      Logger.warn(`清空项目签名密钥失败（目录不存在或不是 git 仓库），已移除记录: ${repoRoot}`);
      this.removeLocalSignProject(repoRoot);
      return false;
    }
    try {
      execFileSync('git', ['config', '--local', '--unset', 'user.signingkey'], {
        cwd: repoRoot,
        stdio: 'ignore',
      });
    } catch (error) {
      // 本来就没设置时 --unset 返回非 0，视为已清空
    }
    Logger.success(
      `已清空项目签名密钥:\n${chalk.cyan(
        'git config --local --unset user.signingkey'
      )}\n${repoRoot}`
    );
    this.removeLocalSignProject(repoRoot);
    return true;
  }

  /**
   * 从本地存储的项目记录中移除指定项目
   */
  removeLocalSignProject(repoRoot) {
    const projects = getLocalSignProjects();
    delete projects[repoRoot];
    saveLocalSignProjects(projects);
  }

  /**
   * --local-empty [项目路径]：清空项目的签名密钥（git config --local --unset user.signingkey），并移除本地记录
   *  带参数：直接清空该项目（路径须是 git 仓库）
   *  不带参数：从通过 --local-default 设置过的项目列表中选择
   */
  async executeLocalEmpty(target) {
    let repoRoot;
    if (target === true) {
      const projects = getLocalSignProjects();
      const repoRoots = Object.keys(projects);
      if (!repoRoots.length) {
        Logger.warn('没有通过 --local-default 设置过项目密钥的项目');
        return;
      }
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'repoRoot',
          message: '请选择要清空项目密钥的项目',
          choices: repoRoots.map((root, index) => ({
            value: root,
            name: `${index + 1}. ${root}  ${chalk.cyan(
              (projects[root].fingerprint || '').slice(0, 8)
            )}`,
          })),
          loop: false,
        },
      ]);
      repoRoot = answers.repoRoot;
    } else {
      // 统一按仓库根目录处理，保证与 --local-default 记录的路径一致
      try {
        repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
          cwd: resolve(target),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch (error) {
        throw new Error(`不是 git 仓库: ${resolve(target)}`);
      }
    }
    this.clearLocalSignKey(repoRoot);
  }

  async execute() {
    if (this.args.create) await this.executeCreate();
    else if (this.args.list) await this.executeList();
    else if (this.args.export) await this.executeExport();
    else if (this.args.delete) await this.executeDelete();
    else if (this.args.default) await this.executeDefault(this.args.default);
    else if (this.args.localDefault) await this.executeLocalDefault(this.args.localDefault);
    else if (this.args.localEmpty) await this.executeLocalEmpty(this.args.localEmpty);
    else this.args.command.help();
  }
}

export default async function (options: any = {}, command: any = {}) {
  const keys = process.argv.slice(2);
  if (keys.includes('--auto-sign')) {
    // autoSign 解析值写入本地存储，供下次默认值取用
    config.set('autoSign', options.autoSign);
    Logger.success(
      `签名提交：${
        options.autoSign
          ? `已开启，${chalk.cyan(BIN)} 未加 ${chalk.cyan('-s/--sign')} 时自动加上 ${chalk.cyan(
              '--sign'
            )}`
          : '已关闭'
      }`
    );
  } else {
    const action = new GpgAction({ ...options, command });
    await action.run();
  }
}
