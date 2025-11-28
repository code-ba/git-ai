import axios from 'axios';
import { promises as fs } from 'fs';
import { isAbsolute, resolve } from 'path';
import { chat } from '../utils/OpenAI.mjs';
import { config } from '../utils/Storage.mjs';
import inquirer from 'inquirer';
import { formatCompletions } from '../utils/MessageUtils.mjs';
import { OPENAI_MODEL_LIST_URL } from '../const.mjs';
import Logger from '../utils/Logger.mjs';
import Spinner from '../utils/Spinner.mjs';
import BaseAction from './BaseAction.mjs';

class SelectModelAction extends BaseAction {
  async execute() {
    await this.setModel();
  }

  async getModelList() {
    if (!OPENAI_MODEL_LIST_URL) {
      Logger.notice(`需要配置环境变量 \`OPENAI_MODEL_LIST_URL\` 。
此变量指定 OpenAI 模型列表的来源，支持 HTTP(S) URL 或本地文件路径。

** OPENAI_MODEL_LIST_URL 示例：**
*   URL: \`https://raw.githubusercontent.com/xx025/carrot/main/model_list.json\`
*   Linux/macOS 路径: \`/path/to/your/local/model_list.json\`
*   Windows 路径: \`C:\\Path\\To\\Your\\Local\\model_list.json\`

** JSON 配置示例：**
模型id、baseURL、key 配置多个会随机取，必填(id、baseURL)、非必填(keys)
\`\`\`json
{
  "data": [
    {
      "id": "modelId,modelId,modelId",
      "baseURL": "baseURL,baseURL,baseURL",
      "keys": "key,key,key"
    }
  ]
}
\`\`\`
      `);
      throw '未配置环境变量 `OPENAI_MODEL_LIST_URL`';
    }
    const source = OPENAI_MODEL_LIST_URL;
    const isHttpSource = /^https?:\/\//i.test(source);
    const spinner = new Spinner('正在加载模型列表...');
    spinner.start();
    try {
      if (isHttpSource) {
        const { data } = await axios.get(source);
        spinner.stop();
        return data;
      }
      const filePath = isAbsolute(source) ? source : resolve(process.cwd(), source);
      const content = await fs.readFile(filePath, 'utf8');
      spinner.stop();
      return JSON.parse(content);
    } catch (error) {
      spinner.stop();
      throw error && error.message ? error.message : error;
    }
  }

  async selectModels() {
    const modelConfig = {
      list: [],
      origin: [],
    };

    try {
      modelConfig.origin = (await this.getModelList()).data || [];
      modelConfig.list = modelConfig.origin.map((item) => item.id);
      if (!modelConfig.list.length) {
        throw '未找到可用的模型';
      }
    } catch (error) {
      throw error && error.message ? error.message : error;
    }
    try {
      const answers = await inquirer.prompt([
        {
          type: 'rawlist',
          name: 'model',
          message: `请选择模型`,
          choices: modelConfig.list,
          default: '',
          loop: false,
        },
      ]);
      const item = modelConfig.origin.find((item) => item.id === answers.model);
      if (!item.baseURL || !item.id) {
        throw `模型信息不完整: 请检查 \`baseURL\` 和 \`id\``;
      }
      config.set('baseURL', item.baseURL);
      config.set('model', item.id);
      config.set('key', item.keys);
      Logger.success(`已设置模型: \n   - ${item.id.split(`,`).join('\n   - ')}`);
    } catch (error) {
      throw `设置模型失败: ${error && error.message ? error.message : error}`;
    }
  }
  // 验证模型是否可用
  async validateModel() {
    const spinner = new Spinner('正在验证模型是否可用...');
    spinner.start();

    const startTimestamp = Date.now();
    const configModel = config.get('model') ? config.get('model').split(',') : [];
    const total = configModel.length;
    const errTotal = [];
    while (configModel.length) {
      const model = configModel.shift();
      try {
        const result = await chat({
          model: model,
          messages: [
            {
              role: 'user',
              content: '1+1=?',
            },
          ],
        });
        formatCompletions(result);
      } catch {
        errTotal.push(model);
      }
    }
    spinner.stop();
    if (total - errTotal.length > 0) {
      Logger.success(`模型验证通过 ${total - errTotal.length} 个`);
    }
    if (errTotal.length) {
      Logger.error(`模型验证失败 ${errTotal.length} 个，分别是：\n${errTotal.join('\n   - ')}`);
    }

    const endTimestamp = Date.now();
    const duration = endTimestamp - startTimestamp;

    Logger.success(`本次检查模型用时: ${(duration / 1000).toFixed(3)} 秒`);
  }

  async setModel() {
    await this.selectModels();
    await this.validateModel();
  }
}

export default async function () {
  const action = new SelectModelAction();
  await action.run();
}
