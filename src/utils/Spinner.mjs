import Logger from './Logger.mjs';
import { collectSpinnerState } from './Log.mjs';
import cliSpinner from 'cli-spinner';
export default class Spinner {
  constructor(text = 'loading', spinnerString = '|/-\\') {
    this.spinner = new cliSpinner.Spinner(text + '.. %s');
    this.spinner.setSpinnerString(spinnerString);
  }

  start() {
    this.spinner.start();
    collectSpinnerState('start', this.spinner.text);
    return this;
  }

  success(text) {
    this.stop();
    collectSpinnerState('success', text || this.spinner.text);
    Logger.success(text);
    return this;
  }

  error(text) {
    this.stop();
    collectSpinnerState('error', text || this.spinner.text);
    Logger.error(text);
    return this;
  }
  sleep(ms = 1000) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stop() {
    this.spinner.stop(true);
    // 停止
    collectSpinnerState('stop', '停止转圈动画输出');
    return this;
  }
}
