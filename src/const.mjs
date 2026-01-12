import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
// 读取 package.json 文件
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkgPath = resolve(__dirname, '../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
export const BIN = Object.keys(pkg.bin)[0].split('-').join(' ');
export const NAME = pkg.name;
export const DESCRIPTION = pkg.description;
export const VERSION = pkg.version;
export const AUTHOR = pkg.author;
export const LOWEST_NODE_VERSION = pkg.engines.node;
export const OPENAI_TIMEOUT = 60 * 1000 * 3;
export const OPENAI_MAX_TOKEN_DEFAULT = 128000;
export const OPENAI_MODEL_LIST_URL = process.env.OPENAI_MODEL_LIST_URL;
export const OPENAI_COMMIT_MESSAGE_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];
export const asciiArt = `
 ██████╗ ██╗████████╗     █████╗ ██╗
██╔════╝ ██║╚══██╔══╝    ██╔══██╗██║
██║  ███╗██║   ██║       ███████║██║
██║   ██║██║   ██║       ██╔══██║██║
╚██████╔╝██║   ██║       ██║  ██║██║
 ╚═════╝ ╚═╝   ╚═╝       ╚═╝  ╚═╝╚═╝
`;
