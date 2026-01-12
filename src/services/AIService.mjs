import { chat } from '../utils/OpenAI.mjs';
import { generateSystemMessage, formatCompletions } from '../utils/MessageUtils.mjs';
import { config } from '../utils/Storage.mjs';
import chalk from 'chalk';
/**
 * AI 服务类
 * 封装所有 AI 相关操作
 */
export class AIService {
  constructor(userName) {
    this.userName = userName;
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
          content: generateSystemMessage(this.userName),
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
          content:
            '你是一个资深的 Git 专家，请分析用户提供的 git commit 失败日志，输出造成失败的最可能原因，并给出简洁的排查或修复步骤。请使用中文回答，结构可以是：原因 + 处理建议。',
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
