import { isAxiosError } from 'axios';
import { config } from '../utils/Storage.mjs';
import {
  BIN,
  OPENAI_COMMIT_MESSAGE_TYPES,
  OPENAI_MAX_TOKEN_DEFAULT,
  CHECK_GITIGNORE_ENABLE,
  CHECK_DEPENDENCIES_ENABLE,
  CHECK_LARGE_FILES_ENABLE,
  CHECK_CACHE_FILES_ENABLE,
  CHECK_BUILD_ARTIFACTS_ENABLE,
  LARGE_FILE_WARN_SIZE,
  LARGE_FILE_CONFIRM_SIZE,
  SKIP_LARGE_FILE_CONFIRM_KEY,
} from '../const.mjs';
import {
  checkGitignoreExists,
  findDependencyFiles,
  findCacheFiles,
  findBuildArtifacts,
  findLargeFiles,
  formatFileSize,
} from '../utils/CheckUtils.mjs';
import { parseCommitMessage, buildCommitMessage } from '../utils/MessageUtils.mjs';
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
  constructor({ allowEmpty, noVerify, noAdd, sign, noSign }) {
    super({ allowEmpty, noVerify, noAdd, sign, noSign });

    this.allowEmpty = allowEmpty;
    this.noVerify = noVerify;
    this.noAdd = noAdd;
    this.sign = sign;
    this.noSign = noSign;
    // 是否有冲突文件
    this.isConflit = false;

    // 初始化服务
    this.gitService = new GitService();
    this.aiService = null;

    // 配置信息
    this.maxToken = 0;

    // 工作信息
    this.workingPrefix = '';
    this.repoRoot = '';
    this.diffString = '';
    this.commitArgs = [];
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
    this.checkSign();
    this.checkWorkingPrefix();
    await this.checkGitConflict();
    await this.addCommand();
    await this.checkStagedFiles();
    await this.commitMerge();
    this.initCommitMessageRegexp();
    await this.getDiffString();
    await this.commit();
    this.getBranchInfo();
    await this.getRemoteInfo();
    await this.gitFetch();
    await this.gitMerge();
    await this.checkGitConflict();
    await this.push();
  }

  /**
   * 在 spinner 中执行异步任务：给耗时操作提供转动反馈
   * 正常结束先停止 spinner 再打印 success 日志（否则步骤无感知、页面闪烁），异常时原样抛出由上层处理
   */
  async runWithSpinner(text, task, doneText) {
    const spinner = new Spinner(text);
    spinner.start();
    let result;
    try {
      result = await task();
    } finally {
      spinner.stop();
    }
    Logger.success(doneText || `${text.replace(/^正在/, '').replace(/\.{2,}$/, '')}完成`);
    return result;
  }

  /**
   * 准备配置
   */
  prepare() {
    this.maxToken = parseInt(config.get('maxToken') || OPENAI_MAX_TOKEN_DEFAULT);
    const flags = [];
    if (this.dryRun) flags.push('--dry-run');
    if (this.allowEmpty) flags.push('--allow-empty');
    if (this.noVerify) flags.push('--no-verify');
    this.commitArgs = ['commit', ...flags, '-m'];
  }

  /**
   * 检查 GPG 签名：按全局 commit.gpgsign、脚手架 autoSign 配置、--sign/--noSign 指令决定提交是否签名
   */
  checkSign() {
    // git config --global --get commit.gpgsign
    const globalGpgsign = this.gitService.getGlobalCommitGpgsign();
    // 脚手架 config（git ai gpg --auto-sign 写入本地存储）
    const autoSign = config.get('autoSign');
    // 脚手架签名指令
    const sign = this.sign;
    // 脚手架不签名指令
    const noSign = this.noSign;
    // gpg 签名列表
    const gpglist = this.gitService.getGpgKeyList();

    // 核心逻辑判断 和 log 提示
    if (noSign && sign) {
      throw '--sign --noSign 不能一起用';
    }
    // 不需要签名就不需要做额外处理
    if (noSign) {
      // 提交时带上 --no-gpg-sign（全局开启 commit.gpgsign 时跳过签名）
      this.commitArgs.splice(1, 0, '--no-gpg-sign');
      return;
    }
    // 签名提交，但是没有一个签名就报错
    if ((globalGpgsign || sign || autoSign) && !gpglist.length) {
      throw `未找到 GPG 签名密钥，请使用 ${BIN} gpg --create 生成签名`;
    }
    // 说明必须签名
    if (sign || autoSign) {
      // 提交时带上 -S
      this.commitArgs.splice(1, 0, '-S');
    }
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
  async checkGitConflict() {
    // 检查状态
    const statusOutput = await this.runWithSpinner(
      '正在检测工作区状态...',
      () => this.gitService.getStatus(),
      '工作区状态检测完成'
    );
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
    if (this.noAdd) return;
    this.checkGitignore();
    await this.runWithSpinner(
      '正在执行 git add...',
      () => this.gitService.add(),
      'git add 执行完成'
    );
    if (!this.isConflit) return;
    await this.checkGitConflict();
  }

  /**
   * 检测 .gitignore（git add 之前），不存在则告警提示
   */
  checkGitignore() {
    if (!CHECK_GITIGNORE_ENABLE) return;
    try {
      this.repoRoot = this.gitService.getRepoRoot();
    } catch (error) {
      collectWarning(error);
      return;
    }
    if (!checkGitignoreExists(this.repoRoot)) {
      Logger.warn('未检测到 .gitignore 文件，建议添加，避免将依赖包、大文件等提交到仓库');
    }
  }

  /**
   * 提交前检测暂存区：缓存文件（告警）、依赖包/构建产物/压缩包（需确认）、大文件（告警+确认）
   */
  async checkStagedFiles() {
    if (
      !CHECK_DEPENDENCIES_ENABLE &&
      !CHECK_LARGE_FILES_ENABLE &&
      !CHECK_CACHE_FILES_ENABLE &&
      !CHECK_BUILD_ARTIFACTS_ENABLE
    ) {
      return;
    }

    let stagedFiles = [];
    try {
      stagedFiles = await this.runWithSpinner(
        '正在分析暂存区文件...',
        () => this.gitService.getStagedFiles(),
        '暂存区文件分析完成'
      );
    } catch (error) {
      collectWarning(error);
      return;
    }
    if (!stagedFiles.length) return;

    if (!this.repoRoot) {
      try {
        this.repoRoot = this.gitService.getRepoRoot();
      } catch (error) {
        collectWarning(error);
      }
    }

    // 检测缓存/临时文件，仅告警不阻断
    if (CHECK_CACHE_FILES_ENABLE) {
      this.checkCacheFiles(stagedFiles);
    }
    // 检测依赖包目录，用户确认提交后才会继续检测后续项
    if (CHECK_DEPENDENCIES_ENABLE) {
      await this.checkDependencies(stagedFiles);
    }
    // 检测构建产物目录与压缩包文件
    if (CHECK_BUILD_ARTIFACTS_ENABLE) {
      await this.checkBuildArtifacts(stagedFiles);
    }
    if (CHECK_LARGE_FILES_ENABLE) {
      await this.checkLargeFiles(stagedFiles);
    }
  }

  /**
   * 格式化检测结果展示列表：目录按聚合展示，散落文件单独列出（最多 10 条）
   */
  formatCheckResult(dirs, files) {
    const dirLines = dirs.map((item) => `  - ${item.dir}（${item.count} 个文件）`);
    const standaloneFiles = files.filter(
      (file) => !dirs.some((item) => file.startsWith(`${item.dir}/`))
    );
    const fileLines = standaloneFiles
      .slice(0, 10)
      .map((file) => `  - ${file}`)
      .concat(standaloneFiles.length > 10 ? [`  ...等共 ${standaloneFiles.length} 个文件`] : []);
    return [...dirLines, ...fileLines].join('\n');
  }

  /**
   * 检测缓存/临时/系统垃圾文件：仅告警提示建议加入 .gitignore，不阻断提交
   */
  checkCacheFiles(stagedFiles) {
    const { dirs, files } = findCacheFiles(stagedFiles);
    if (!files.length) return;
    Logger.warn(
      `检测到缓存/临时文件，建议加入 .gitignore：\n${this.formatCheckResult(dirs, files)}`
    );
  }

  /**
   * 检测构建产物目录与压缩包文件：列出后询问确认，默认 N，取消则中止提交
   */
  async checkBuildArtifacts(stagedFiles) {
    const { dirs, files } = findBuildArtifacts(stagedFiles);
    if (!dirs.length && !files.length) return;

    Logger.warn(`检测到正在提交构建产物或压缩包文件：\n${this.formatCheckResult(dirs, files)}`);
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认提交以上构建产物/压缩包文件？',
        default: false,
      },
    ]);
    if (!confirm) {
      throw '已取消提交，建议将构建产物目录和压缩包文件加入 .gitignore';
    }
  }

  /**
   * 检测依赖包目录：列出目录询问确认，默认 N，取消则中止提交
   */
  async checkDependencies(stagedFiles) {
    const { depDirs } = findDependencyFiles(stagedFiles);
    if (!depDirs.length) return;

    const dirList = depDirs.map((item) => `  - ${item.dir}（${item.count} 个文件）`).join('\n');
    Logger.warn(`检测到正在提交依赖包目录：\n${dirList}`);
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认提交以上依赖包目录？',
        default: false,
      },
    ]);
    if (!confirm) {
      throw '已取消提交，建议将依赖包目录加入 .gitignore 后重试';
    }
  }

  /**
   * 检测大文件：超过 LARGE_FILE_WARN_SIZE 告警提示，超过 LARGE_FILE_CONFIRM_SIZE 需用户确认
   * 用户确认一次后，以后都跳过超过 LARGE_FILE_CONFIRM_SIZE 的大文件检测（阈值见 const.mjs）
   */
  async checkLargeFiles(stagedFiles) {
    const { warnFiles, confirmFiles } = await this.runWithSpinner(
      '正在检测大文件...',
      () => findLargeFiles(stagedFiles, this.repoRoot),
      '大文件检测完成'
    );
    const warnSizeText = formatFileSize(LARGE_FILE_WARN_SIZE);
    const confirmSizeText = formatFileSize(LARGE_FILE_CONFIRM_SIZE);

    if (warnFiles.length) {
      const fileList = warnFiles
        .map((item) => `  - ${item.file}（${formatFileSize(item.size)}）`)
        .join('\n');
      Logger.warn(`检测到 ${warnFiles.length} 个大文件（超过 ${warnSizeText}）：\n${fileList}`);
    }

    if (!confirmFiles.length) return;
    // 用户此前已确认过（记录在当前仓库的 .git/config），跳过超过确认阈值的大文件检测
    if (this.gitService.getLocalConfig(SKIP_LARGE_FILE_CONFIRM_KEY) === 'true') return;

    const fileList = confirmFiles
      .map((item) => `  - ${item.file}（${formatFileSize(item.size)}）`)
      .join('\n');
    Logger.warn(`检测到超大文件（超过 ${confirmSizeText}）：\n${fileList}`);
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确认提交以上超大文件？确认后当前仓库以后将跳过 ${confirmSizeText} 以上大文件检测`,
        default: false,
      },
    ]);
    if (!confirm) {
      throw '已取消提交，建议将超大文件加入 .gitignore 或使用 Git LFS 管理';
    }
    // 仅记录在当前仓库的 .git/config，不影响其他项目
    this.gitService.setLocalConfig(SKIP_LARGE_FILE_CONFIRM_KEY, 'true');
    Logger.info(`已记录（仅当前仓库）：以后将跳过 ${confirmSizeText} 以上大文件检测`);
  }

  /**
   * 初始化提交消息校验正则（scope 由 AI 生成，匹配任意值）
   */
  initCommitMessageRegexp() {
    this.OPENAI_COMMIT_MESSAGE_REGEXP = new RegExp(
      `^((${OPENAI_COMMIT_MESSAGE_TYPES.join('|')})\\([^)]*\\))!?:[\\s\\S]*`
    );
  }

  /**
   * 获取差异字符串
   */
  async getDiffString() {
    this.diffString = await this.runWithSpinner(
      '正在获取代码差异...',
      () => this.gitService.getDiff(this.maxToken),
      '代码差异获取完成'
    );
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
      this.aiService = new AIService();
      const result = await this.aiService.generateCommitMessage(this.diffString);
      spinner.stop();
      try {
        this.commitMessage = buildCommitMessage(parseCommitMessage(result));
      } catch (parseError) {
        // 借鉴 langchain OutputFixingParser：解析失败自动让模型修复一次
        const fixSpinner = new Spinner('输出不符合格式，正在自动修复...');
        fixSpinner.start();
        try {
          const fixed = await this.aiService.fixCommitMessage(result, parseError.message);
          this.commitMessage = buildCommitMessage(parseCommitMessage(fixed));
          fixSpinner.success('已自动修复输出格式');
        } catch (fixError) {
          fixSpinner.stop();
          throw fixError;
        }
      }
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
            `更新内容超过模型支持的最大 token 数，请选择更小的文件集，或执行 \`${BIN} init\` 重新设置最大 token 数。`
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
  async commitMerge() {
    if (!this.gitService.isMerging()) {
      return;
    }

    // 确保没有未解决的冲突
    const statusOutput = await this.gitService.getStatus();
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
      if (!this.allowEmpty) {
        Logger.warn(this.workingPrefix ? '当前目录下没有要提交的更改' : '没有要提交的更改');
        return;
      }
      await this.commitEmpty();
      return;
    } else if (this.allowEmpty) {
      throw '暂存区有变更，--allowEmpty 仅用于空提交，请先执行 git stash 暂存变更，或去掉该参数后重试';
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
      await this.gitService.commit([...this.commitArgs, this.commitMessage]);
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
          const gitStatus = await this.gitService.getStatus();
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
          errSpinner.error('AI 诊断 git commit 失败原因时出错');
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
   * 空提交（--allowEmpty 且暂存区无变更）：跳过 AI，由用户输入提交说明
   */
  async commitEmpty() {
    Logger.warn(
      this.workingPrefix
        ? '当前目录下没有要提交的更改，将执行空提交（--allow-empty）'
        : '没有要提交的更改，将执行空提交（--allow-empty）'
    );
    const { message } = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: '请输入提交说明：',
        validate: (input) => (input && input.trim() ? true : '提交说明不能为空'),
      },
    ]);
    this.commitMessage = message.trim();
    const spinner = new Spinner('正在提交代码...');
    spinner.start();
    await spinner.sleep();
    try {
      await this.gitService.commit([...this.commitArgs, this.commitMessage]);
      spinner.success('git commit 提交成功...');
    } catch (error) {
      spinner.stop();
      collectError(error);
      this.gitService.reset();
      throw error && error.message ? error.message : error;
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
    try {
      this.remoteName = await this.runWithSpinner(
        '正在获取远程仓库地址...',
        () => this.gitService.getRemoteName(this.currentBranch),
        '获取 git 远程仓库地址成功'
      );
    } catch (error) {
      collectError(error);
      Logger.error(`获取 git 远程仓库地址失败，请检查 Git 是否正确配置`);
      throw error && error.message ? error.message : error;
    }
  }

  /**
   * Git fetch
   */
  async gitFetch() {
    try {
      await this.runWithSpinner(
        '正在获取远程仓库最新状态，执行 git fetch...',
        () => this.gitService.fetch(this.remoteName),
        `远程分支 ${this.remoteName} 的最新更改状态获取成功`
      );
    } catch (error) {
      collectWarning(error);
      Logger.error(`fetch 失败：${error && error.message ? error.message : error}`);
    }
  }

  /**
   * Git merge
   */
  async gitMerge() {
    // Logger.info('正在检测是否需要合并...');
    try {
      const aheadCount = this.gitService.getAheadCount(this.remoteName, this.currentBranch);
      if (aheadCount > 0) {
        // git merge 为本地操作但大仓库可能较慢，用 spinner 包裹
        await this.runWithSpinner(
          `正在合并远程分支 ${this.remoteName}/${this.currentBranch} 的 ${aheadCount} 个提交...`,
          () => this.gitService.merge(this.remoteName, this.currentBranch),
          `本地分支落后远程分支 ${chalk.green(`${aheadCount}次`)}，已合并最新代码`
        );
      } else {
        Logger.success('本地代码是最新，无需合并');
      }
    } catch (error) {
      collectWarning(error);
      Logger.warn(`合并失败：${error && error.message ? error.message : error}`);
      await this.commitMerge();
    }
  }

  /**
   * 推送代码
   */
  async push() {
    const pushCount = this.gitService.getPushCount(this.remoteName, this.currentBranch);
    const originHasBranch = pushCount === -1;

    if (pushCount !== 0) {
      try {
        await this.runWithSpinner(
          originHasBranch
            ? `远程分支${this.currentBranch}不存在，正在推送新分支...`
            : '正在推送本地分支与远程分支的差异...',
          () => this.gitService.push(this.remoteName, this.currentBranch),
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
