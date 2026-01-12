import { getModelList } from '../utils/OpenAI.mjs';
import { config } from '../utils/Storage.mjs';
import inquirer from 'inquirer';
import { BIN } from '../const.mjs';
import Logger from '../utils/Logger.mjs';
import Spinner from '../utils/Spinner.mjs';
import BaseAction from './BaseAction.mjs';
class SetModelAction extends BaseAction {
  constructor(modelId) {
    super(modelId);
    this.modelId = typeof modelId === 'string' ? modelId.trim() : '';
    this.defaultModel = config.get('model') || '';
    this.key = config.get('key');
    this.baseURL = config.get('baseURL');
  }

  async selectModels() {
    const list = [];
    Logger.info(`Base URL：${this.baseURL}`);
    const spinner = new Spinner('正在加载模型列表...');
    spinner.start();

    try {
      list.push(...(await getModelList()));

      if (!list.length) {
        throw '未找到可用的模型';
      }
      spinner.success(`可用模型:${list.length}个`);
    } catch (error) {
      spinner.error('加载模型列表失败');
      throw error && error.message ? error.message : error;
    }
    try {
      const answers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'models',
          message: `请选择模型`,
          choices: list,
          loop: false,
          validate(input) {
            if (!input || input.length === 0) {
              return '请至少选择 1 个模型';
            }
            return true;
          },
          default: [],
        },
      ]);
      if (!answers.models.length) {
        throw '最少选择 1 个模型';
      }
      this.modelId = answers.models.join(',');
      config.set('model', this.modelId);
    } catch (error) {
      throw error && error.message ? error.message : error;
    }
  }
  async execute() {
    config.set('model', this.modelId);
    if (!this.modelId && this.defaultModel) {
      Logger.warn('已清空设置的模型');
    }
    if (!this.modelId) {
      if (this.baseURL && !this.key) {
        Logger.warn(`检测到 api key 为空，可能获取列表失败。设置 \`${BIN} set-key <your key>\``);
      }
      await this.selectModels();
    }
    if (this.modelId) {
      Logger.success(`已设置模型: \n   - ${this.modelId.split(`,`).join('\n   - ')}`);
    }
    // await this.validateModel();
  }
}

export default async function (event) {
  const action = new SetModelAction(event);
  await action.run();
}
