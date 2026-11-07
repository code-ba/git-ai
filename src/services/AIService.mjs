import { chat } from '../utils/OpenAI.mjs';
import { generateSystemMessage, formatCompletions } from '../utils/MessageUtils.mjs';
import { config } from '../utils/Storage.mjs';
import chalk from 'chalk';
/**
 * AI 服务类
 * 封装所有 AI 相关操作
 */
export class AIService {
  constructor() {
    this.usageMessage = '';
  }
  // 检查是否配置 baseUrl model
  checkConfig() {
    const baseURL = config.get('baseURL');
    const key = config.get('key');
    return baseURL && key;
  }

  /**
   * 生成提交消息
   */
  async generateCommitMessage(diffString) {
    const result = await chat({
      messages: [
        {
          role: 'system',
          content: generateSystemMessage(),
        },
        { role: 'user', content: diffString },
      ],
    });
    if (result.data && result.data.error && !result.data.choices) {
      throw result.data.error;
    }

    if (result.data.usage) {
      this.usageMessage = chalk.underline(
        `本次模型消耗统计：总数 ${result.data.usage.total_tokens} tokens、输入 ${result.data.usage.prompt_tokens} tokens、输出 ${result.data.usage.completion_tokens} tokens`
      );
    }

    return formatCompletions(result);
  }

  /**
   * 让模型修复不符合格式的提交消息（借鉴 langchain OutputFixingParser）
   * 将格式指令（system）、原始输出与错误信息一并喂回模型，自动修复一次
   * @param {string} originalOutput 首次生成的不符合格式的原始输出
   * @param {string} error 解析失败的错误信息
   */
  async fixCommitMessage(originalOutput, error) {
    const result = await chat({
      messages: [
        {
          role: 'system',
          content: generateSystemMessage(),
        },
        {
          role: 'user',
          content: `Completion:
--------------
${originalOutput}
--------------

Above, the Completion did not satisfy the constraints given in the Instructions.
Error:
--------------
${error}
--------------

Please try again. Please only respond with an answer that satisfies the constraints laid out in the Instructions:`,
        },
      ],
    });

    if (result.data && result.data.error && !result.data.choices) {
      throw result.data.error;
    }

    if (result.data.usage) {
      this.usageMessage = chalk.underline(
        `本次模型消耗统计（含格式修复调用）：总数 ${result.data.usage.total_tokens} tokens、输入 ${result.data.usage.prompt_tokens} tokens、输出 ${result.data.usage.completion_tokens} tokens`
      );
    }

    return formatCompletions(result);
  }

  /**
   * 让 AI 帮忙分析 git commit 失败原因
   * @param {Object} payload
   * @param {string} payload.errorMessage git commit 抛出的错误
   * @param {string} payload.gitStatus 当前 git status 输出
   * @param {string} payload.hookLogs 如果有 hook 输出，可传入
   */
  async analyzeCommitFailure({ errorMessage = '', gitStatus = '', hookLogs = '' } = {}) {
    this.usageMessage = '';
    const contextParts = [];
    if (errorMessage) {
      contextParts.push(`Git 命令报错：\n${errorMessage}`);
    }
    if (gitStatus) {
      contextParts.push(`git status 输出：\n${gitStatus}`);
    }
    if (hookLogs) {
      contextParts.push(`Hook 输出：\n${hookLogs}`);
    }
    const userPrompt = contextParts.length
      ? contextParts.join('\n\n')
      : '未提供额外日志，只知道 git commit 失败。';

    const result = await chat({
      messages: [
        {
          role: 'system',
          content: [
            '你是一个资深的 Git 专家，请分析用户提供的 git commit 失败日志，输出造成失败的最可能原因，并给出简洁的排查或修复步骤。请使用中文回答，结构可以是：原因 + 处理建议。',
            '',
            '用户正在使用 git ai 脚手架（基于 AI 的 Git 提交工具，自动分析代码变更生成规范提交信息并推送），给出处理建议时优先结合脚手架已有能力：',
            '1. 代码校验（如 eslint、prettier、单元测试等 pre-commit hook）拦截提交：先给出修复问题的方法；若用户想跳过本次校验，可提示使用 git ai -n（等同于 git commit --no-verify）。',
            '2. GPG 签名相关失败（密钥不存在、未设置默认签名密钥、gpg 签名报错等）：推荐用脚手架管理密钥，比手动 gpg 命令更方便——git ai gpg --create 交互式创建密钥并导出公钥、自动设为默认签名密钥；git ai gpg --list 查看本机密钥；git ai gpg --default 设置默认签名密钥；git ai gpg --auto-sign true 开启自动签名（等同于 git commit -S）；临时跳过签名使用 git ai --noSign（等同于 git commit --no-gpg-sign）。',
            '3. 提交内容为空时可用 git ai -e（等同于 git commit --allow-empty）；跳过 git add 只提交已暂存内容可用 git ai --noAdd。',
            '',
            '注意：脚手架命令仅在与失败原因相关时推荐，无关时只给通用 Git 排查建议，不要堆砌命令。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.2,
    });

    if (result.data && result.data.usage) {
      this.usageMessage = chalk.underline(
        `本次模型消耗统计：总数 ${result.data.usage.total_tokens} tokens、输入 ${result.data.usage.prompt_tokens} tokens、输出 ${result.data.usage.completion_tokens} tokens`
      );
    }

    if (result.data && result.data.error && !result.data.choices) {
      throw result.data.error;
    }

    return formatCompletions(result);
  }

  /**
   * 获取使用统计信息
   */
  getUsageMessage() {
    return this.usageMessage;
  }
}
