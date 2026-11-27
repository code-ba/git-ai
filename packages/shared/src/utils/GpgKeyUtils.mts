import { execFileSync } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { findGlobalSignKey } from './SignKeyUtils.mjs';

// gpg pubkey algo 编号 → 算法名（ed25519 单独处理，与 --create 的命名保持一致）
const ALGO_NAMES = { 1: 'rsa', 2: 'dsa', 16: 'elg', 18: 'ecdh', 19: 'ecdsa' };

const getGpgListArgs = (recordType) => [
  '--quiet',
  '--with-colons',
  '--with-keygrip',
  recordType === 'sec' ? '--list-secret-keys' : '--list-keys',
];

/**
 * 解析 gpg --with-colons --with-keygrip 输出，返回主密钥列表（不含子密钥条目，子密钥指纹收集在 subFprs）
 * @param {string} recordType - 'pub' 公钥列表（--list-keys）/ 'sec' 签名密钥列表（--list-secret-keys，仅有私钥的密钥）
 * 每项：{ fingerprint, keygrip, algo, keyLength, created, uid, subFprs }
 */
const parseGpgKeys = (out, recordType) => {
  const keys: any[] = [];
  let current: any = null;
  // 主密钥信息收集齐全（fpr/grp/uid），在记录边界收尾入列
  const isComplete = (key) => key.fingerprint && key.keygrip && key.uid;
  out.split(/\r?\n/).forEach((line) => {
    const parts = line.split(':');
    if (parts[0] === recordType) {
      if (current && isComplete(current)) keys.push(current);
      current = {
        fingerprint: '',
        keygrip: '',
        algo: parseInt(parts[3], 10),
        keyLength: parseInt(parts[2], 10),
        created: parseInt(parts[5], 10),
        uid: '',
        subFprs: [],
      };
      return;
    }
    if (!current) return;
    if (parts[0] === 'fpr') {
      // 第一个 fpr 是主密钥指纹，后续 fpr 是子密钥（ssb）指纹
      if (!current.fingerprint) current.fingerprint = parts[9];
      else current.subFprs.push(parts[9]);
    } else if (parts[0] === 'grp' && !current.keygrip) {
      current.keygrip = parts[9];
    } else if (parts[0] === 'uid' && !current.uid) {
      current.uid = parts[9];
    }
  });
  if (current && isComplete(current)) keys.push(current);
  return keys;
};

export const listGpgKeys = (recordType = 'pub') => {
  let out = '';
  try {
    out = execFileSync('gpg', getGpgListArgs(recordType), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    return [];
  }
  return parseGpgKeys(out, recordType);
};

/**
 * 导出文件名里的 Real name：文件名不允许的字符替换为 _，为空时返回空字符串（由调用方回退到指纹前 8 位）
 */
export const formatFileName = (realname) =>
  (realname || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\p{Cc}/gu, '')
    .trim();

/**
 * 格式化时间戳：年月日_时分秒，如 20261106_064512
 */
export const formatTimestamp = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

/**
 * 格式化日期：年-月-日，如 2026-11-06
 */
export const formatDate = (seconds) => {
  const date = new Date(seconds * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * 算法展示名：ed25519 / rsa3072（与 --create 的命名保持一致）
 */
export const formatAlgo = (algo, keyLength) =>
  algo === 22 ? 'ed25519' : `${ALGO_NAMES[algo] || `algo${algo}`}${keyLength}`;

/**
 * 密钥列表行（带颜色和缩进）：缩进 序号(黄) 指纹(青) UID 算法(绿) 创建日期(灰)，全局生效的签名密钥行尾追加（默认）
 */
export const formatKeyLine = (key, index, isDefault) =>
  `  ${chalk.yellow(`${index + 1}.`)} ${chalk.cyan(key.fingerprint)}  ${key.uid}  ${chalk.green(
    formatAlgo(key.algo, key.keyLength)
  )}  ${chalk.gray(formatDate(key.created))}${isDefault ? '（默认）' : ''}`;

/**
 * 从密钥列表中选择一个密钥，返回主密钥指纹
 * 选项单行展示（指纹取前 8 位），避免多行选项在 inquirer list 滚动时渲染错位
 * 全局生效的签名密钥（user.signingkey 优先，其次 gpg.conf default-key）的选项行尾自动标注（默认）
 * @param {Function} [markMatch] - 可选，命中时选项末尾追加标注，如 (key) => parseUid(key.uid).email === 'xxx'
 * @param {string} [markText] - 可选，与 markMatch 搭配使用的标注文案，如（当前）
 * @param {string} [defaultFingerprint] - 可选，默认选中的密钥指纹（光标默认停在该项）
 */
export const promptKey = async (
  keys,
  message,
  markMatch?: any,
  markText?: any,
  defaultFingerprint?: any
) => {
  const globalKey = findGlobalSignKey(keys);
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'fingerprint',
      message,
      choices: keys.map((key, index) => ({
        value: key.fingerprint,
        name: `${index + 1}. ${chalk.cyan(key.fingerprint.slice(0, 8))}  ${key.uid}  ${chalk.green(
          formatAlgo(key.algo, key.keyLength)
        )}  ${chalk.gray(formatDate(key.created))}${markMatch && markMatch(key) ? markText : ''}${
          globalKey && key.fingerprint === globalKey.fingerprint ? '（默认）' : ''
        }`,
      })),
      default: defaultFingerprint,
      loop: false,
    },
  ]);
  return answers.fingerprint;
};
