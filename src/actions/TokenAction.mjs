import { config } from '../utils/Storage.mjs';
import Logger from '../utils/Logger.mjs';
import { formatToken } from '../utils/Utils.mjs';
import BaseAction from './BaseAction.mjs';

class SetTokenAction extends BaseAction {
  constructor(key) {
    super(key);
    this.key = key || '';
  }

  async execute() {
    config.set('key', this.key);
    if (this.key) {
      Logger.success(`OpenAI Api Key 已设置: ${formatToken(this.key)}`);
    } else {
      Logger.warn(`OpenAI Api Key 已设置为空`);
    }
  }
}

export default async function (key) {
  const action = new SetTokenAction(key);
  await action.run();
}
