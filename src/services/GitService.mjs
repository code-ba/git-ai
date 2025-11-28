import { execSync } from 'child_process';
import { collectGitExecLog } from '../utils/Log.mjs';
import Logger from '../utils/Logger.mjs';

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
   * 执行 git add
   */
  add() {
    this.exec('git add .', { stdio: ['pipe', 'pipe', 'ignore'] });
  }

  /**
   * 获取用户名
   */
  getUserName() {
    return this.exec('git config user.name').toString().trim();
  }

  /**
   * 获取差异字符串
   */
  getDiff(maxToken) {
    try {
      let diffString = this.exec('git diff --staged -U0', {
        stdio: ['pipe', 'pipe', 'ignore'],
      }).toString();

      if (!diffString || diffString.length <= maxToken) {
        return diffString.trim();
      }
      return this.exec('git diff --staged --stat', {
        stdio: ['pipe', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    } catch (e) {
      return this.exec('git diff --staged --stat', {
        stdio: ['pipe', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
    }
  }

  /**
   * 获取 Git 状态
   */
  getStatus() {
    return this.exec('git status --porcelain');
  }

  /**
   * 执行 commit
   */
  async commit(commitMessage) {
    return new Promise((resolve, reject) => {
      try {
        execSync(commitMessage, {
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
   * 获取远程仓库名称
   */
  async getRemoteName(currentBranch) {
    return new Promise((resolve, reject) => {
      let remoteName = '';

      // 优先从当前分支配置中读取 remote
      try {
        remoteName = this.exec(`git config --get branch.${currentBranch}.remote`, {
          stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
      } catch {
        Logger.warn(`未找到当前分支 ${currentBranch} 的 remote 配置`);
      }

      if (!remoteName) {
        try {
          const upstream = this.exec('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
            stdio: ['pipe', 'pipe', 'ignore'],
          }).trim();
          if (upstream && upstream.includes('/')) {
            remoteName = upstream.split('/')[0];
          }
        } catch {
          Logger.warn(`未找到当前分支 ${currentBranch} 的 upstream 配置`);
        }
      }

      // 回退：选择已存在的 remote（优先 origin）
      if (!remoteName) {
        try {
          const remotesOutput = this.exec('git remote', {
            stdio: ['pipe', 'pipe', 'ignore'],
          }).trim();
          const remotes = remotesOutput ? remotesOutput.split('\n').filter(Boolean) : [];
          if (remotes.includes('origin')) {
            remoteName = 'origin';
          } else if (remotes.length > 0) {
            remoteName = remotes[0];
          }
        } catch (error) {
          reject(error);
        }
      }

      if (!remoteName) {
        reject('未找到任何远程仓库配置');
      }

      try {
        // 验证 remote 是否存在
        this.exec(`git remote show ${remoteName}`, {
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        // 返回 remote
        resolve(remoteName);
      } catch (error) {
        reject(error);
      }
    });
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
   * Fetch 远程分支
   */
  fetch(remoteName) {
    this.exec(`git fetch ${remoteName}`, {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  }

  /**
   * 合并远程分支
   */
  merge(remoteName, currentBranch) {
    this.exec(`git merge ${remoteName}/${currentBranch}`, {
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
   * 推送到远程
   */
  push(remoteName, currentBranch) {
    return new Promise((resolve, reject) => {
      try {
        this.exec(`git push -u ${remoteName} ${currentBranch}`, {
          stdio: ['pipe', 'pipe', 'ignore'],
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 检查远程分支是否存在
   */
  remoteHasBranch(remoteName, currentBranch) {
    try {
      this.exec(`git rev-parse --verify --quiet ${remoteName}/${currentBranch}`, {
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return true;
    } catch {
      return false;
    }
  }
}
