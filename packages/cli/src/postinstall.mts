import { existsSync } from 'fs';
import { execSync } from 'child_process';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const OTHER_PACKAGE = 'git-agents-cli';

let globalRoot;
const getGlobalRoot = () => {
  if (!globalRoot) {
    // stderr 一并忽略，避免 npm 的配置警告混进安装输出
    globalRoot = execSync('npm root -g', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  }
  return globalRoot;
};

// 仅全局安装（本包位于 npm root -g 之下）时执行检测，本地与 CI 安装直接跳过
const isGlobalInstall = () => {
  try {
    const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    return pkgDir.startsWith(`${getGlobalRoot()}${path.sep}`);
  } catch (error) {
    return false;
  }
};

const isGloballyInstalled = (pkgName) => {
  try {
    return existsSync(path.join(getGlobalRoot(), ...pkgName.split('/')));
  } catch (error) {
    return false;
  }
};

// y/n 确认，默认 y；stdin 不是 TTY（如 CI）时等同 n
const promptYesNo = (message) =>
  new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(false);
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message}（y/n，默认 y）：`, (answer) => {
      rl.close();
      resolve(!answer || answer.trim().toLowerCase() === 'y');
    });
  });

const uninstallGlobal = (pkgName) => {
  execSync(`npm uninstall -g ${pkgName}`, { stdio: 'inherit' });
};

const main = async () => {
  if (!isGlobalInstall()) return;
  if (!isGloballyInstalled(OTHER_PACKAGE)) return;
  const confirmed = await promptYesNo(
    `检测到已安装新版本 ${OTHER_PACKAGE}，正在安装的是旧版本 @git-ai/cli，新版本功能更强大，按 Enter 将卸载新版本并继续使用旧版本`
  );
  if (!confirmed) return;
  uninstallGlobal(OTHER_PACKAGE);
};

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
});
