/**
 * 归类 git 命令错误：将原始报错信息匹配为简短的中文原因
 * @param {Error & {message?: string}} error - git 执行抛出的错误对象
 * @returns {string} 分类后的错误原因文案
 */
export const classifyGitError = (error) => {
  const rawMessage = (error && error.message ? error.message : String(error)).toLowerCase();
  let reason;
  if (
    rawMessage.includes('permission denied') ||
    rawMessage.includes('publickey') ||
    rawMessage.includes('authentication failed') ||
    rawMessage.includes('could not read username') ||
    rawMessage.includes('terminal prompts disabled')
  ) {
    reason = '权限或认证失败，请检查 SSH key / 凭据';
  } else if (rawMessage.includes('not found') || rawMessage.includes('404')) {
    reason = '远程仓库不存在（404），请检查仓库地址';
  } else if (
    rawMessage.includes('does not appear to be a git repository') ||
    rawMessage.includes('bad config')
  ) {
    reason = '远程仓库地址配置错误，请检查 remote 地址';
  } else if (
    rawMessage.includes('ssl certificate') ||
    rawMessage.includes('certificate verification')
  ) {
    reason = 'SSL 证书校验失败，请检查证书或网络环境';
  } else if (rawMessage.includes('host key')) {
    reason = '远程主机密钥校验失败，请检查 known_hosts 配置';
  } else if (
    rawMessage.includes('could not resolve hostname') ||
    rawMessage.includes('could not resolve proxy') ||
    rawMessage.includes('connection timed out') ||
    rawMessage.includes('operation timed out') ||
    rawMessage.includes('connection refused') ||
    rawMessage.includes('failed to connect') ||
    rawMessage.includes('network') ||
    rawMessage.includes('proxy')
  ) {
    reason = '网络连接失败，请检查网络或代理';
  } else if (rawMessage.includes('no space left')) {
    reason = '磁盘空间不足';
  } else if (rawMessage.includes('lock')) {
    reason = 'Git 锁文件冲突，请检查是否有其他 Git 进程';
  } else {
    reason = '未知错误，详情见错误日志';
  }
  return reason;
};
