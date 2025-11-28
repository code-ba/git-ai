import { config } from '../utils/Storage.mjs';
import Logger from '../utils/Logger.mjs';
import BaseAction from './BaseAction.mjs';

class SetBaseUrlAction extends BaseAction {
  constructor(baseURL = '') {
    super(baseURL);
    this.baseURL = baseURL.trim();
  }

  async execute() {
    config.set('baseURL', this.baseURL);
    if (this.baseURL) {
      Logger.success(`Base URL 已设置为: ${this.baseURL}`);
    } else {
      Logger.warn(`Base URL 已清空。`);
    }
  }
}

export default async function (args) {
  const action = new SetBaseUrlAction(args);
  await action.run();
}
