import { exitProcess } from '../utils/Utils.mjs';
import Logger from '../utils/Logger.mjs';
/**
 * Action 基类
 * 所有 action 都应该继承此类并实现 execute 方法
 */
class BaseAction {
  constructor(args) {
    this.args = args;
    this.startTimestamp = Date.now();
  }

  /**
   * 子类需要实现此方法来执行具体的业务逻辑
   */
  async execute() {
    throw new Error('execute() method must be implemented by subclass');
  }

  /**
   * 运行 action，处理错误和退出逻辑
   */
  async run() {
    const handleCtrlC = () => {
      console.log('\n');
      Logger.warn('检测到 Ctrl+C，正在安全退出...');
      exitProcess(1, this.startTimestamp);
    };
    process.once('SIGINT', handleCtrlC);

    try {
      await this.execute();
      process.off('SIGINT', handleCtrlC);
      exitProcess(0, this.startTimestamp);
    } catch (error) {
      process.off('SIGINT', handleCtrlC);
      Logger.error(error && typeof error.message === 'string' ? error.message : error);
      exitProcess(1, this.startTimestamp);
    }
  }
}
export default BaseAction;
