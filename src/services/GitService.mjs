import { execSync, exec as execCallback, execFileSync } from 'child_process';
import { promisify } from 'util';
import { collectGitExecLog } from '../utils/Log.mjs';
import Logger from '../utils/Logger.mjs';
import Spinner from '../utils/Spinner.mjs';
import { EXEC_MAX_BUFFER_SIZE } from '../const.mjs';

// 异步 exec：供耗时命令使用，避免阻塞事件循环导致 spinner 卡顿
const execPromise = promisify(execCallback);

const sanitizeExecOptions = (options = {}) => {
  return Object.entries(options).reduce((acc, [key, value]) => {
    if (typeof value === 'function') {
      acc[key] = `[Function ${value.name || 'anonymous'}]`;
      return acc;
    }
    if (value instanceof Buffer) {
      acc[key] = `[Buffer length=${value.length}]`;
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
};

/**
 * Git 操作服务类
 * 封装所有 Git 相关操作
 */
export class GitService {
  constructor() {}

  /**
   * 执行 Git 命令
   */
  exec(command, options = {}) {
    const execOptions = {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      // 默认放宽 maxBuffer（execSync 默认仅 1MB），超大仓库的文件列表类输出不会超限；
      // 调用方仍可通过 options.maxBuffer 覆盖（如 getDiff 按 token 预算收紧）
      maxBuffer: EXEC_MAX_BUFFER_SIZE,
      ...options,
    };

    try {
      const result = execSync(command, execOptions);
      collectGitExecLog({
        command,
        options: sanitizeExecOptions(execOptions),
        status: 'success',
        output: typeof result === 'string' ? result : '',
      });
      return result;
    } catch (error) {
      collectGitExecLog({
        command,
        options: sanitizeExecOptions(execOptions),
        status: 'error',
        error: error && error.message ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 执行 Git 命令（异步）：耗时命令使用，不阻塞事件循环，spinner 可正常转动
   */
  async execAsync(command, options = {}) {
    const execOptions = {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: EXEC_MAX_BUFFER_SIZE,
      ...options,
    };
    try {
      const { stdout } = await execPromise(command, execOptions);
      collectGitExecLog({
        command,
        options: sanitizeExecOptions(execOptions),
        status: 'success',
        output: typeof stdout === 'string' ? stdout : '',
      });
      return stdout;
    } catch (error) {
      collectGitExecLog({
        command,
        options: sanitizeExecOptions(execOptions),
        status: 'error',
        error: error && error.message ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 检查是否安装 Git
   */
  checkInstalled() {
    try {
      const hasGit = this.exec('git --version').toString().trim();
      if (!hasGit) {
        throw '当前没有安装 git，请先安装 git...';
      }
    } catch (error) {
      throw error && error.message ? error.message : error;
    }
  }

  /**
   * 检查是否为 Git 仓库
   */
  checkRepository() {
    try {
      this.exec('git rev-parse --is-inside-work-tree');
    } catch (error) {
      throw `当前目录不是 git 仓库，请先初始化 git 仓库...\n${
        error && error.message ? error.message : error
      }`;
    }
  }

  /**
   * 获取工作目录前缀
   */
  getWorkingPrefix() {
    try {
      const workingPrefix =
        this.exec('git rev-parse --show-prefix', {
          stdio: ['pipe', 'pipe', 'ignore'],
        }) || '';
      return workingPrefix.trim();
    } catch (error) {
      Logger.warn(`${error && error.message ? error.message : error}`);
      return '';
    }
  }

  /**
   * 执行 git add（异步，避免大仓库长时间阻塞界面）
   */
  async add() {
    await this.execAsync('git add .', { stdio: ['pipe', 'pipe', 'ignore'] });
  }

  /**
   * 获取 git 全局邮箱（git config --global user.email），未设置时返回空字符串
   */
  getUserEmail() {
    try {
      return this.exec('git config --global user.email', {
        stdio: ['pipe', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * 读取全局签名开关（git config --global --get commit.gpgsign），未设置或非 true 时返回 false
   */
  getGlobalCommitGpgsign() {
    try {
      return (
        this.exec('git config --global --get commit.gpgsign', {
          stdio: ['pipe', 'pipe', 'ignore'],
        })
          .toString()
          .trim() === 'true'
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取 gpg 签名密钥列表（所有私钥的 uid 行）；gpg 未安装时返回空列表，请求时间很长
   */
  getGpgKeyList() {
    try {
      const output = this.exec('gpg --list-secret-keys --with-colons', {
        stdio: ['pipe', 'pipe', 'ignore'],
      }).toString();
      return output.split('\n').filter((line) => line.startsWith('uid:'));
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取差异字符串（异步，避免大仓库阻塞界面）
   * 采用"先探测规模、再按需拉取"策略：
   * 先用 --shortstat（输出恒定很小）估算规模，超过 token 预算则只返回 --stat 摘要，
   * 避免把大 diff（如超大项目首次提交时的全仓库内容）读入内存
   */
  async getDiff(maxToken) {
    const getStatDiff = async () => {
      try {
        return (
          await this.execAsync('git diff --staged --stat', {
            stdio: ['pipe', 'pipe', 'ignore'],
          })
        ).trim();
      } catch {
        return '';
      }
    };

    try {
      // 1. 廉价探测变更规模，估算 diff 字节量级
      const shortStat = await this.execAsync('git diff --staged --shortstat', {
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      // 2. 估算超过字符预算（UTF-8 每字符最多 4 字节）时，直接返回摘要，不拉取完整 diff
      if (this.estimateDiffBytes(shortStat) > maxToken * 4) {
        return await getStatDiff();
      }

      // 3. 拉取完整 diff：显式按 token 预算收紧 maxBuffer（exec 默认已放宽到 EXEC_MAX_BUFFER_SIZE），
      //    保证该命令内存有界；若仍超限（如单行超长导致估算失准）由外层 catch 兜底降级
      const diffString = await this.execAsync('git diff --staged -U0', {
        stdio: ['pipe', 'pipe', 'ignore'],
        maxBuffer: maxToken * 4 + 1024 * 1024,
      });

      if (!diffString || diffString.length <= maxToken) {
        return diffString.trim();
      }
      return await getStatDiff();
    } catch (e) {
      // 极端情况（如单行超长文件导致估算失准触发 ENOBUFS）兜底，保证不向外抛异常
      return await getStatDiff();
    }
  }

  /**
   * 根据 --shortstat 输出估算 diff 字节大小
   * 输出形如：" 3 files changed, 120 insertions(+), 5 deletions(-)"
   */
  estimateDiffBytes(shortStat) {
    const insertions = Number((shortStat.match(/(\d+) insertions?/) || [])[1] || 0);
    const deletions = Number((shortStat.match(/(\d+) deletions?/) || [])[1] || 0);
    // 每行变更按 200 字节保守估算（含 @@ 头、文件头等元信息）
    return (insertions + deletions) * 200;
  }

  /**
   * 获取仓库根目录
   */
  getRepoRoot() {
    return this.exec('git rev-parse --show-toplevel', {
      stdio: ['pipe', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  }

  /**
   * 获取暂存区文件列表（相对仓库根目录路径，异步）
   */
  async getStagedFiles() {
    try {
      // -z 以 \0 分隔，避免含空格或非 ASCII 字符的路径被 git 转义
      const output = await this.execAsync('git diff --staged --name-only --diff-filter=ACMR -z', {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return output.split('\0').filter(Boolean);
    } catch (error) {
      // 首次提交（无 HEAD）时回退为列出暂存区全部文件
      const output = await this.execAsync('git ls-files --cached -z', {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return output.split('\0').filter(Boolean);
    }
  }

  /**
   * 读取仓库本地配置（.git/config），不存在时返回空字符串
   */
  getLocalConfig(key) {
    try {
      return this.exec(`git config --local --get ${key}`, {
        stdio: ['pipe', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch (error) {
      return '';
    }
  }

  /**
   * 写入仓库本地配置（.git/config），仅对当前仓库生效
   */
  setLocalConfig(key, value) {
    this.exec(`git config --local ${key} ${value}`, {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  }

  /**
   * 获取 Git 状态（异步，避免大仓库阻塞界面）
   */
  async getStatus() {
    return this.execAsync('git status --porcelain');
  }

  /**
   * 执行 commit
   * 使用参数数组形式调用 git，不经 shell 解析，
   * 避免提交消息中的引号、换行、$、` 等字符破坏命令（兼容 Windows cmd/PowerShell 与 macOS/Linux shell）
   */
  async commit(commitArgs) {
    return new Promise((resolve, reject) => {
      try {
        execFileSync('git', commitArgs, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        resolve();
      } catch (error) {
        const stdout = this.normalizeExecOutput(error && error.stdout);
        const stderr = this.normalizeExecOutput(error && error.stderr);
        const messageParts = [error && error.message ? error.message : '', stderr, stdout].filter(
          Boolean
        );
        error.stdout = stdout;
        error.stderr = stderr;
        error.message = messageParts.join('\n').trim() || 'git commit 失败';
        reject(error);
      }
    });
  }

  normalizeExecOutput(output) {
    if (!output) {
      return '';
    }
    if (typeof output === 'string') {
      return output.trim();
    }
    if (Buffer.isBuffer(output)) {
      return output.toString('utf8').trim();
    }
    return '';
  }

  /**
   * 重置暂存区
   */
  reset() {
    this.exec('git reset', { stdio: ['pipe', 'pipe', 'ignore'] });
  }

  /**
   * 获取当前分支名
   */
  getCurrentBranch() {
    return this.exec('git rev-parse --abbrev-ref HEAD').trim();
  }

  /**
   * 获取远程仓库名称（异步；git remote show 为网络操作，不阻塞界面）
   */
  async getRemoteName(currentBranch) {
    const spinner = new Spinner('正在获取远程仓库地址...').start();
    try {
      let remoteName = '';

      // 优先从当前分支配置中读取 remote
      try {
        remoteName = (
          await this.execAsync(`git config --get branch.${currentBranch}.remote`, {
            stdio: ['pipe', 'pipe', 'ignore'],
          })
        ).trim();
      } catch {
        spinner.stop();
        Logger.warn(`未找到当前分支 ${currentBranch} 的 remote 配置`);
        spinner.start();
      }

      if (!remoteName) {
        try {
          const upstream = (
            await this.execAsync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
              stdio: ['pipe', 'pipe', 'ignore'],
            })
          ).trim();
          if (upstream && upstream.includes('/')) {
            remoteName = upstream.split('/')[0];
          }
        } catch {
          spinner.stop();
          Logger.warn(`未找到当前分支 ${currentBranch} 的 upstream 配置`);
          spinner.start();
        }
      }

      // 回退：选择已存在的 remote（优先 origin）
      if (!remoteName) {
        const remotesOutput = (
          await this.execAsync('git remote', {
            stdio: ['pipe', 'pipe', 'ignore'],
          })
        ).trim();
        const remotes = remotesOutput ? remotesOutput.split('\n').filter(Boolean) : [];
        if (remotes.includes('origin')) {
          remoteName = 'origin';
        } else if (remotes.length > 0) {
          remoteName = remotes[0];
        }
      }

      if (!remoteName) {
        throw '未找到任何远程仓库配置';
      }

      // 验证 remote 是否存在（网络操作）
      await this.execAsync(`git remote show ${remoteName}`, {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return remoteName;
    } finally {
      spinner.stop();
    }
  }

  /**
   * 检查是否处于合并状态
   */
  isMerging() {
    try {
      this.exec('git rev-parse --verify --quiet MERGE_HEAD', {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 完成合并
   */
  finishMerge() {
    this.exec('git commit --no-edit', {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  }

  /**
   * Fetch 远程分支（异步，网络操作不阻塞界面）
   */
  async fetch(remoteName) {
    await this.execAsync(`git fetch ${remoteName}`, {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  }

  /**
   * 合并远程分支（异步，大仓库合并可能较慢，不阻塞界面）
   */
  async merge(remoteName, currentBranch) {
    await this.execAsync(`git merge ${remoteName}/${currentBranch}`, {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  }

  /**
   * 获取本地领先远程的提交数
   */
  getAheadCount(remoteName, currentBranch) {
    const aheadOutput = this.exec(`git log --oneline HEAD..${remoteName}/${currentBranch}`, {
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return aheadOutput ? aheadOutput.split('\n').filter((line) => line.trim()).length : 0;
  }

  /**
   * 获取需要推送的提交数
   */
  getPushCount(remoteName, currentBranch) {
    // 先验证远程分支是否存在
    try {
      this.exec(`git rev-parse --verify --quiet ${remoteName}/${currentBranch}`, {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      return -1;
    }

    try {
      const pushOutput = this.exec(`git log --oneline ${remoteName}/${currentBranch}..HEAD`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      return pushOutput ? pushOutput.split('\n').filter((line) => line.trim()).length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * 推送到远程（异步，网络操作不阻塞界面）
   */
  async push(remoteName, currentBranch) {
    await this.execAsync(`git push -u ${remoteName} ${currentBranch}`, {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  }
}
