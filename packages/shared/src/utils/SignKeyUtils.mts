/**
 * 签名密钥配置的读取与匹配
 * 配置值（user.signingkey / gpg.conf 的 default-key）可以是完整指纹、key ID（指纹后缀）或邮箱，匹配时统一处理
 * 生效顺序与 git 一致：项目密钥（git config --local user.signingkey）→ 全局 user.signingkey → gpg.conf 的 default-key
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * 从 UID 解析 Real name （name）、邮箱（尖括号内 email）
 * 邮箱取最后一个尖括号里的内容，姓名取它之前的部分并去掉末尾的 (备注)
 * 如 cxvh (gitee.com) <info@cxvh.com> → { realname: 'cxvh', email: 'info@cxvh.com' }
 * 如 a <b> <x@y.com> → { realname: 'a <b>', email: 'x@y.com' }
 */
export const parseUid = (uid) => {
  const emailMatch = uid.match(/<([^<>]*)>(?=[^<>]*$)/);
  const name = emailMatch ? uid.slice(0, emailMatch.index).trim() : uid.trim();
  return {
    realname: name.replace(/\s*\([^()]*\)\s*$/, '').trim(),
    email: emailMatch ? emailMatch[1].trim() : '',
  };
};

/**
 * 读取 git 全局签名密钥（git config --global user.signingkey，未设置时返回空字符串）
 */
export const getGitGlobalSigningKey = () => {
  try {
    return execFileSync('git', ['config', '--global', 'user.signingkey'], {
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    return '';
  }
};

/**
 * 读取项目签名密钥（git config --local user.signingkey，未设置或不在 git 仓库内时返回空字符串）
 */
export const getGitLocalSigningKey = () => {
  try {
    return execFileSync('git', ['config', '--local', 'user.signingkey'], {
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    return '';
  }
};

/**
 * 读取 gpg 层默认密钥（gpg.conf 中 default-key 的值，文件或配置项不存在时返回空字符串）
 * gpg.conf 所在目录：设置了 GNUPGHOME 环境变量用该目录，否则为用户主目录下的 .gnupg
 * 有多行 default-key 时取最后一行，与 gpg 的行为一致
 */
export const getGpgConfDefaultKey = () => {
  try {
    let gpgHome = process.env.GNUPGHOME || join(homedir(), '.gnupg');
    // Git for Windows 自带的 gpg 使用 MSYS 路径（如 /c/Users/x/.gnupg），转成 Windows 路径供 fs 读取
    if (process.platform === 'win32') {
      gpgHome = gpgHome.replace(/^\/([a-zA-Z])\//, '$1:/');
    }
    const gpgConf = readFileSync(join(gpgHome, 'gpg.conf'), 'utf8');
    const matches = [...gpgConf.matchAll(/^\s*default-key\s+(\S+)/gm)];
    return matches.length ? matches[matches.length - 1][1] : '';
  } catch (error) {
    return '';
  }
};

/**
 * 按 user.signingkey 的值匹配可签名密钥，返回命中的主密钥（未命中或值为空时返回 undefined）：
 * 支持主密钥/子密钥的指纹或 key ID（指纹后缀，大小写不敏感）、邮箱
 */
export const findKeyBySigningKey = (keys, signingKey) => {
  if (!signingKey) return undefined;
  const lower = signingKey.toLowerCase();
  return keys.find((key) => {
    if (key.fingerprint.toLowerCase().endsWith(lower)) return true;
    if (key.subFprs.some((fpr) => fpr.toLowerCase().endsWith(lower))) return true;
    const email = parseUid(key.uid).email.toLowerCase();
    return !!email && email === lower;
  });
};

/**
 * 两个签名密钥配置值是否指向同一把密钥
 * 配置值可以是完整指纹、key ID（指纹后缀）或邮箱，所以不能只比较字符串
 */
export const isSameSignKey = (keys, a, b) => {
  if (!a || !b) return false;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  const keyA = findKeyBySigningKey(keys, a);
  const keyB = findKeyBySigningKey(keys, b);
  // 两边都能匹配到密钥：比较指纹
  if (keyA && keyB) return keyA.fingerprint === keyB.fingerprint;
  // 只有一边能匹配到：另一边的值若也能匹配到这把密钥，视为同一把
  const matched = keyA || keyB;
  return !!matched && findKeyBySigningKey([matched], keyA ? b : a) === matched;
};

/**
 * 全局生效的签名密钥，优先级与 git 一致：全局 user.signingkey 的密钥 → gpg.conf default-key 的密钥
 * 在私钥列表中匹配不到时返回 null，否则返回主密钥并附加：
 *  source  - 'user.signingkey' | 'gpg.conf'，实际生效的来源
 *  both    - 两处都配置了且不指向同一把密钥
 *  invalid - 配置了但指向本机不存在的密钥的那一处：'user.signingkey' | 'gpg.conf'；没有则为 null
 */
export const findGlobalSignKey = (keys) => {
  const signingKey = getGitGlobalSigningKey();
  const gpgConfKey = getGpgConfDefaultKey();
  const byGit = signingKey ? findKeyBySigningKey(keys, signingKey) : null;
  const byConf = gpgConfKey ? findKeyBySigningKey(keys, gpgConfKey) : null;
  const key = byGit || byConf;
  if (!key) return null;
  let invalid: string | null = null;
  if (signingKey && !byGit && byConf) invalid = 'user.signingkey';
  if (gpgConfKey && !byConf && byGit) invalid = 'gpg.conf';
  return {
    ...key,
    source: byGit ? 'user.signingkey' : 'gpg.conf',
    both: !!signingKey && !!gpgConfKey && !isSameSignKey(keys, signingKey, gpgConfKey),
    invalid,
  };
};
