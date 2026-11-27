import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
// 读取 package.json 文件
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkgPath = resolve(__dirname, '../../package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
export const BIN = Object.keys(pkg.bin)[0].split('-').join(' ');
export const NAME = pkg.name;
export const DESCRIPTION = pkg.description;
export const VERSION = pkg.version;
