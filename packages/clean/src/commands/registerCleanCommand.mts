import CleanAction from '../actions/CleanAction.mjs';

export function registerCleanCommand(program) {
  program
    .command('clean')
    .description(`清理被 .gitignore 忽略却已提交的文件（本地文件保留）`)
    .action(CleanAction);
}
