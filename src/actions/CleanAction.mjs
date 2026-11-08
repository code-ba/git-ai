import { execFileSync } from 'child_process';
import inquirer from 'inquirer';
import BaseAction from './BaseAction.mjs';
import { GitService } from '../services/GitService.mjs';
import Logger from '../utils/Logger.mjs';

/**
 * Clean Action 类
 * 检测已提交进仓库、但仍命中 .gitignore 规则的文件，并清理出索引（本地文件保留）
 */
class CleanAction extends BaseAction {
  constructor(args) {
    super(args);

    this.gitService = new GitService();
  }

  async execute() {
    // 检查环境
    this.gitService.checkInstalled();
    this.gitService.checkRepository();

    const files = this.findTrackedIgnoredFiles();
    if (!files.length) {
      Logger.success('未检测到 .gitignore 有问题的文件');
      return;
    }

    // 列表展示：按一级目录聚合计数
    const groups = this.groupByTopLevel(files);
    Logger.warn(
      `.gitignore 有问题的列表：\n${groups
        .map((item) => `${item.label}（${item.count}）`)
        .join('\n')}`
    );

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: '是否修复（从 git 索引移除，本地文件保留）？',
        default: true,
      },
    ]);
    if (!confirm) return;

    this.removeFromIndex(files);
    Logger.success(`已清理 ${files.length} 个文件，本地文件已保留`);
  }

  /**
   * 列出已跟踪但命中 .gitignore 规则的文件（相对仓库根目录）
   */
  findTrackedIgnoredFiles() {
    const output = this.gitService.exec('git ls-files --cached --ignored --exclude-standard -z', {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return output.split('\0').filter(Boolean);
  }

  /**
   * 按一级目录聚合计数
   */
  groupByTopLevel(files) {
    const groups = new Map();
    files.forEach((path) => {
      const index = path.indexOf('/');
      const label = index === -1 ? path : `${path.slice(0, index)}/`;
      groups.set(label, (groups.get(label) || 0) + 1);
    });
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, count }));
  }

  /**
   * 从索引移除文件，保留工作区文件；分批执行避免命令行过长
   */
  removeFromIndex(files) {
    const batchSize = 100;
    for (let i = 0; i < files.length; i += batchSize) {
      execFileSync('git', ['rm', '--cached', '--quiet', '--', ...files.slice(i, i + batchSize)], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }
  }
}

export default async function () {
  const action = new CleanAction();
  await action.run();
}
