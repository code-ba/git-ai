import { config } from '../utils/Storage.mjs';
import { OPENAI_MAX_TOKEN_DEFAULT, AI_REQUEST_TYPES } from '../const.mjs';
import { getModelList } from '../utils/OpenAI.mjs';
import inquirer from 'inquirer';
import Logger from '../utils/Logger.mjs';
import Spinner from '../utils/Spinner.mjs';
import BaseAction from './BaseAction.mjs';

/**
 * 掩码展示 key：前后截取一部分，中间用 * 替代
 * @param {string} key - 单个或多个 key（逗号分隔）
 * @returns {string} 掩码后的 key
 */
const maskKey = (key = '') =>
  key
    .split(',')
    .map((t) => {
      const len = t.length;
      if (len <= 8) return `${t.slice(0, 1)}****`;
      return `${t.slice(0, 4)}******${t.slice(-4)}`;
    })
    .join(',');

/**
 * init 交互式初始化配置，依次完成：
 *  1. 请求类型：list 选择，默认 chat（旧版本用户未配置时也默认 chat，与请求端兜底一致）
 *  2. baseURL / key / max-token：文本输入；已配置则回显到输入位置上方，回车保持当前值，未配置必填；key 回显掩码
 *  3. model：接口模型列表多选；本地配置与列表完全匹配时才回显并预选，否则重新选择；拉取失败降级手动输入
 * 每项确认后立即写入全局配置，全部完成后输出摘要（key 掩码展示）
 */
class InitAction extends BaseAction {
  /**
   * 将当前配置回显到输入位置上方，未配置则不回显
   */
  echoCurrent(label, value, mask = false) {
    if (!value) return;
    Logger.info(`${label}（回车保持当前值）: ${mask ? maskKey(value) : value}`);
  }

  /**
   * 交互输入一项配置：未输入时取当前配置值，未配置时必填
   */
  async promptConfig({ name, label, mask = false, validate }) {
    const current = config.get(name) || '';
    this.echoCurrent(label, current, mask);
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name,
        message: `请输入${label}`,
        validate: (input) => {
          const value = (input || '').trim();
          if (!value) return current ? true : `${label}不能为空`;
          return validate ? validate(value) : true;
        },
      },
    ]);
    const value = (answers[name] || '').trim() || current;
    config.set(name, value);
    return value;
  }

  /**
   * init 第一步：选择请求类型（chat / responses / anthropic）
   * - 默认 chat；已配置 requestType 时回显到输入位置上方，并作为默认选中项，回车保持当前值
   * - 旧版本用户未配置 requestType 时同样默认选中 chat，与请求端兜底逻辑保持一致
   */
  async promptRequestType() {
    const current = config.get('requestType') || '';
    this.echoCurrent('requestType', current);
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'requestType',
        message: '请选择请求类型',
        choices: AI_REQUEST_TYPES,
        default: current || 'chat',
        loop: false,
      },
    ]);
    config.set('requestType', answers.requestType);
    return answers.requestType;
  }

  /**
   * model 配置：从接口拉取模型列表多选（baseURL / key 已在前序步骤写入配置）
   * - 读取本地已配置的 model（逗号分隔多个），仅当其全部能与下拉列表完全匹配时才回显并预选中，回车保持当前值
   * - 无法完全匹配（或未配置）时不回显，由用户自行选择，至少选 1 个
   * - 模型列表拉取失败时降级为手动输入，保证 init 流程不中断
   */
  async promptModel() {
    const localModels = (config.get('model') || '').split(',').filter(Boolean);
    const spinner = new Spinner('正在加载模型列表...');
    spinner.start();
    let list;
    try {
      list = await getModelList();
      if (!list.length) throw new Error('未找到可用的模型');
      spinner.success(`可用模型:${list.length}个`);
    } catch (error) {
      spinner.error('加载模型列表失败，降级为手动输入');
      return this.promptConfig({ name: 'model', label: 'model' });
    }
    // 本地模型能和下拉完全匹配时才回显并预选，否则不回显让用户重新选择
    const matched = localModels.filter((id) => list.some((item) => item.value === id));
    const fullyMatched = localModels.length > 0 && matched.length === localModels.length;
    if (fullyMatched) {
      this.echoCurrent('model', localModels.join(','));
    }
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'model',
        message: '请选择模型',
        choices: list,
        loop: false,
        default: fullyMatched ? matched : [],
        validate: (input) => (input && input.length ? true : '请至少选择 1 个模型'),
      },
    ]);
    const value = answers.model.join(',');
    config.set('model', value);
    return value;
  }

  async execute() {
    const numberReg = /^[1-9]\d*$/;
    // 第一步先选择请求类型，再依次输入其余配置
    const requestType = await this.promptRequestType();
    const baseURL = await this.promptConfig({ name: 'baseURL', label: 'baseURL' });
    const key = await this.promptConfig({ name: 'key', label: 'OpenAI Api Key', mask: true });
    const model = await this.promptModel();
    const maxToken = await this.promptConfig({
      name: 'maxToken',
      label: 'max-token',
      validate: (value) => {
        if (!numberReg.test(value)) return '请输入正确的数字';
        if (parseInt(value) > OPENAI_MAX_TOKEN_DEFAULT) Logger.warn('不建议 max-token 设置太大');
        return true;
      },
    });
    Logger.success(
      `初始化完成:\n   - requestType: ${requestType}\n   - baseURL: ${baseURL}\n   - key: ${maskKey(
        key
      )}\n   - model: ${model}\n   - max-token: ${maxToken} (${Math.round(maxToken / 1000)}k)`
    );
  }
}

export default async function () {
  const action = new InitAction();
  await action.run();
}
