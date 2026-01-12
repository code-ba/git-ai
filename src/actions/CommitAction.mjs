import { isAxiosError } from 'axios';
import { config } from '../utils/Storage.mjs';
import { BIN, OPENAI_COMMIT_MESSAGE_TYPES, OPENAI_MAX_TOKEN_DEFAULT } from '../const.mjs';
import { formatMessage } from '../utils/MessageUtils.mjs';
import { findConflictFiles } from '../utils/ConflictUtils.mjs';
import { GitService } from '../services/GitService.mjs';
import { AIService } from '../services/AIService.mjs';
import Logger from '../utils/Logger.mjs';
import Spinner from '../utils/Spinner.mjs';
import BaseAction from './BaseAction.mjs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { collectError, collectWarning } from '../utils/Log.mjs';

/**
 * Commit Action 类
 * 负责处理 git commit 的完整流程
 */
class CommitAction extends BaseAction {
  constructor({ allowEmpty, noVerify, skip }) {
    super({ allowEmpty, noVerify, skip });

    this.allowEmpty = allowEmpty;
    this.noVerify = noVerify;
    this.skip = skip;
    // 是否有冲突文件
    this.isConflit = false;

    // 初始化服务
    this.gitService = new GitService();
    this.aiService = null;

    // 配置信息
    this.maxToken = 0;

    // 工作信息
    this.workingPrefix = '';
    this.userName = '';
    this.diffString = '';
    this.commitCommand = '';
    this.commitMessage = '';
    this.OPENAI_COMMIT_MESSAGE_REGEXP = '';
    this.currentBranch = '';
    this.remoteName = '';
  }

  /**
   * 初始化并执行完整流程
   */
  async execute() {
    this.prepare();
    this.gitService.checkInstalled();
    this.gitService.checkRepository();
    this.checkWorkingPrefix();
    this.checkGitConflict();
    await this.addCommand();
    this.commitMerge();
    this.getGitUserInfo();
    this.getDiffString();
    await this.commit();
    this.getBranchInfo();
    await this.getRemoteInfo();
    this.gitFetch();
    this.gitMerge();
    this.checkGitConflict();
    this.push();
  }

  /**
   * 准备配置
   */
  prepare() {
    this.maxToken = parseInt(config.get('maxToken') || OPENAI_MAX_TOKEN_DEFAULT);
    this.commitCommand = this.dryRun
      ? 'git commit --dry-run -m'
      : this.allowEmpty
      ? 'git commit --allow-empty -m'
      : this.noVerify
      ? 'git commit --no-verify -m'
      : 'git commit -m';
  }

  /**
   * 检查工作目录
   */
  checkWorkingPrefix() {
    this.workingPrefix = this.gitService.getWorkingPrefix();
    if (this.workingPrefix) {
      Logger.warn(`当前在子目录 ${this.workingPrefix} 下操作，将只处理此目录下的文件`);
    }
  }

  /**
   * 检查 Git 冲突
   */
  checkGitConflict() {
    // 检查状态
    const statusOutput = this.gitService.getStatus();
    const lines = statusOutput.trim().split('\n');
    let modified = [];
    // 冲突文件列表
    const conflict = [];

    lines.forEach((line) => {
      const item = line.trim();
      const p = item.slice(2).trim();
      if (item.startsWith('UU')) {
        conflict.push(`[冲突]${p}`);
      } else if (item.startsWith('AA')) {
        conflict.push(`[已添加，又被添加]${p}`);
      } else if (item.startsWith('DD')) {
        conflict.push(`[已删除，又被删除]${p}`);
      } else if (item.startsWith('MM') || item.startsWith('M')) {
        modified.push(p);
      }
    });

    const { conflictFiles, ignoreFiles } = findConflictFiles(
      Array.from(new Set(modified)),
      this.workingPrefix
    );
    if (this.workingPrefix && ignoreFiles.length && typeof this.isConflit === 'boolean') {
      Logger.info(
        ignoreFiles.length > 6
          ? `已忽略${ignoreFiles.length}个文件的冲突标记检查`
          : `冲突标记检查忽略文件：\n  - ${ignoreFiles.join('\n  - ')}`
      );
      this.isConflit = 0;
    }

    if (conflictFiles.length > 0) {
      const str = conflictFiles.join('\n  - ');
      Logger.warn(`存在冲突标记，需要手动合并文件：\n  - ${str}`);
      throw '请手动解决 git 冲突...';
    }
    if (!conflict.length) return;
    Logger.warn(`Git 冲突文件：\n  - ${conflict.join('\n  - ')}`);
    this.isConflit = this.isConflit ? this.isConflit + 1 : 1;
  }
  // 使用 inquirer 输入 y 确认是否解决冲突
  async confirmConflict() {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认是否已解决冲突？',
        default: false,
      },
    ]);
    return answer.confirm;
  }
  /**
   * 执行 git add
   */
  async addCommand() {
    if (this.isConflit && !(await this.confirmConflict())) {
      throw '请手动解决冲突';
    }
    if (this.skip) return;
    this.gitService.add();
    if (!this.isConflit) return;
    this.checkGitConflict();
  }

  /**
   * 获取 Git 用户信息
   */
  getGitUserInfo() {
    this.userName = this.gitService.getUserName();
    if (this.userName) {
      this.OPENAI_COMMIT_MESSAGE_REGEXP = new RegExp(
        `^((${OPENAI_COMMIT_MESSAGE_TYPES.join('|')})\\(${this.userName}\\)):[\\s\\S]*`
      );
      return;
    }
    throw `获取 git 用户信息时出错，\n  请执行 \`git config user.name <your name>\` 设置 git 用户名`;
  }

  /**
   * 获取差异字符串
   */
  getDiffString() {
    this.diffString = this.gitService.getDiff(this.maxToken);
  }

  /**
   * 生成提交消息
   */
  async generateMessage() {
    Logger.verbose(`按 Ctrl+C 退出...`);

    const spinner = new Spinner(`正在生成提交消息...`);
    spinner.start();

    try {
      // 初始化 AI 服务
      this.aiService = new AIService(this.userName);
      const result = await this.aiService.generateCommitMessage(this.diffString);
      spinner.stop();
      this.commitMessage = formatMessage(result, this.OPENAI_COMMIT_MESSAGE_REGEXP);
    } catch (error) {
      collectError(error);
      spinner.error('生成 commit message 失败');
      if (isAxiosError(error)) {
        this.gitService.reset();
        if (
          error.response &&
          error.response.status === 400 &&
          error.response.data &&
          error.response.data.error &&
          error.response.data.error.code === 'context_length_exceeded'
        ) {
          Logger.error(
            `更新内容超过模型支持的最大 token 数，请选择更小的文件集，使用 \`${BIN} set-max-token < maxToken >\` 设置最大 token 数。`
          );
        } else {
          if (
            error.response &&
            error.response.data &&
            error.response.data.error &&
            error.response.data.error.message
          ) {
            Logger.error(`错误原因：${error.response.data.error.message}`);
          } else if (error.response && error.response.data) {
            Logger.error('发生了一个意外的 Axios 错误，响应数据。');
          } else if (error.response) {
            Logger.error(`发生了一个 Axios 错误，状态 ${error.response.status}.`);
          } else {
            Logger.error('发生了一个 Axios 网络错误。');
          }
        }
      }
      throw error && error.message ? error.message : error;
    }

    const messageContent = this.commitMessage ? `：\n${chalk.blue(this.commitMessage)}` : '为空。';
    const verify = this.OPENAI_COMMIT_MESSAGE_REGEXP.test(this.commitMessage);
    spinner[verify ? 'success' : 'error'](`AI 生成的内容${messageContent}`);
    if (!verify) {
      throw 'AI 生成的内容不符合规则，请重新生成...';
    }
  }

  /**
   * 判断是否需要通过 commit 去 merge
   */
  commitMerge() {
    if (!this.gitService.isMerging()) {
      return;
    }

    // 确保没有未解决的冲突
    const statusOutput = this.gitService.getStatus();
    const hasUnresolved = statusOutput
      .split('\n')
      .some((line) => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('DD'));

    if (hasUnresolved) {
      throw '仍有未解决的合并冲突，请手动解决后再继续。';
    }
    Logger.info('检测到处于合并流程，正在结束合并...');
    try {
      this.gitService.finishMerge();
      Logger.success('合并已完成');
    } catch (error) {
      collectError(error);
      Logger.error(`合并失败`);
      throw error && error.message ? error.message : error;
    }
  }

  /**
   * Git commit
   */
  async commit() {
    if (!this.diffString) {
      Logger.warn(this.workingPrefix ? '当前目录下没有要提交的更改' : '没有要提交的更改');
      return;
    }
    await this.generateMessage();
    const usageMessage = this.aiService.getUsageMessage();
    if (usageMessage) {
      Logger.info(usageMessage);
    }
    const spinner = new Spinner('正在提交代码...');
    spinner.start();
    await spinner.sleep();
    try {
      await this.gitService.commit(`${this.commitCommand} "${this.commitMessage}"`, this.debug);
      spinner.success('git commit 提交成功...');
    } catch (error) {
      spinner.stop();
      collectError(error);
      let aiDiagnosis = '';
      let usageMessage = '';
      if (this.aiService && typeof this.aiService.analyzeCommitFailure === 'function') {
        const errSpinner = new Spinner('AI 诊断 git commit 失败原因...');
        errSpinner.start();
        try {
          const gitStatus = this.gitService.getStatus();
          const errorMessage = error && error.message ? error.message : error;
          const hookLogs = [error && error.stdout, error && error.stderr]
            .map((log) =>
              typeof log === 'string'
                ? log.trim()
                : log && Buffer.isBuffer(log)
                ? log.toString('utf8').trim()
                : ''
            )
            .filter(Boolean)
            .join('\n');
          aiDiagnosis = await this.aiService.analyzeCommitFailure({
            errorMessage,
            gitStatus,
            hookLogs,
          });
          errSpinner.stop();

          usageMessage = this.aiService.getUsageMessage();
        } catch (diagnosisError) {
          collectWarning(diagnosisError);
          errSpinner.warn('AI 诊断 git commit 失败原因时出错');
        }
      }
      const baseMessage = 'git commit 提交失败';
      this.gitService.reset();
      throw aiDiagnosis
        ? `${baseMessage}，AI 诊断：\n${aiDiagnosis}${usageMessage ? '\n\n' : ''}${usageMessage}`
        : baseMessage;
    }
  }

  /**
   * 获取分支信息
   */
  getBranchInfo() {
    try {
      this.currentBranch = this.gitService.getCurrentBranch();
    } catch (error) {
      collectError(error);
      Logger.error(`获取分支名称失败，请检查 Git 是否正确配置`);
      throw error && error.message ? error.message : error;
    }
  }

  /**
   * 获取远程仓库信息
   */
  async getRemoteInfo() {
    Logger.info(`获取 git 远程仓库地址`);
    try {
      this.remoteName = await this.gitService.getRemoteName(this.currentBranch);
      Logger.success(`获取 git 远程仓库地址成功`);
    } catch (error) {
      collectError(error);
      Logger.error(`获取 git 远程仓库地址失败，请检查 Git 是否正确配置`);
      throw error && error.message ? error.message : error;
    }
  }

  /**
   * Git fetch
   */
  gitFetch() {
    Logger.info(`获取远程仓库最新状态，执行 git fetch...`);
    try {
      this.gitService.fetch(this.remoteName);
      Logger.success(`远程分支 ${this.remoteName} 的最新更改状态获取成功`);
    } catch (error) {
      collectWarning(error);
      Logger.error(`fetch 失败：${error && error.message ? error.message : error}`);
    }
  }

  /**
   * Git merge
   */
  gitMerge() {
    Logger.info('正在检测是否需要合并...');
    try {
      const aheadCount = this.gitService.getAheadCount(this.remoteName, this.currentBranch);
      if (aheadCount > 0) {
        this.gitService.merge(this.remoteName, this.currentBranch);
        Logger.success(`本地分支落后远程分支 \x1b[32m${aheadCount}次\x1b[0m，已合并最新代码`);
      } else {
        Logger.success('本地代码是最新，无需合并');
      }
    } catch (error) {
      collectWarning(error);
      Logger.warn(`合并失败：${error && error.message ? error.message : error}`);
      this.commitMerge();
    }
  }

  /**
   * 推送代码
   */
  async push() {
    const pushCount = this.gitService.getPushCount(this.remoteName, this.currentBranch);
    const originHasBranch = pushCount === -1;

    if (pushCount !== 0) {
      Logger.info(
        originHasBranch
          ? `远程分支${this.currentBranch}不存在，推送新分支...`
          : '正在推送本地分支与远程分支的差异...'
      );
      try {
        await this.gitService.push(this.remoteName, this.currentBranch);
        Logger.success(
          originHasBranch ? '新分支已推送到远程仓库。' : '本地分支与远程分支的差异已推送。'
        );
      } catch (error) {
        collectError(error);
        Logger.error('本地分支与远程分支的差异推送失败');
        this.gitService.reset();
        throw error && error.message ? error.message : error;
      }
    } else {
      Logger.warn('本地分支与远程分支没有差异，无需推送');
    }
  }
}

/**
 * 导出 commit 命令处理函数
 */
export default async function (args) {
  const action = new CommitAction(args);
  await action.run();
}
