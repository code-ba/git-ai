import { config } from '../utils/Storage.mjs';
import { OPENAI_MAX_TOKEN_DEFAULT } from '../const.mjs';
import Logger from '../utils/Logger.mjs';
import BaseAction from './BaseAction.mjs';

class SetMaxTokenAction extends BaseAction {
  constructor(maxToken) {
    super(maxToken);
    this.maxToken = maxToken;
  }

  async execute() {
    const newValue =
      typeof this.maxToken === 'string' && this.maxToken.trim() ? this.maxToken.trim() : '';
    const numberReg = /^[1-9]\d*$/;

    if (!numberReg.test(newValue)) {
      Logger.error(`请输入正确的数字，当前值: "${this.maxToken}"`);
      throw new Error('无效的数字格式');
    }

    if (parseInt(newValue) > OPENAI_MAX_TOKEN_DEFAULT) {
      Logger.warn(`不建议 max-token 设置太大`);
    }

    config.set('maxToken', newValue);
    Logger.success(`最大 token 数已设置: ${newValue} (${Math.round(newValue / 1000)}k)`);
  }
}

export default async function (maxToken) {
  const action = new SetMaxTokenAction(maxToken);
  await action.run();
}
