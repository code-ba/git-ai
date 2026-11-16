// ========== GPG 密钥生成配置 ==========
// 公钥导出目录（基于用户主目录，即 ~/.config/git-ai/cli/gpg）
export const GPG_EXPORT_DIR = '.config/git-ai/cli/gpg';
// git 地址下拉选项（最后一项为手动输入入口，选项不满足时手动输入）
export const GPG_GIT_HOSTS = [
  { value: 'github.com', name: 'github.com' },
  { value: 'gitee.com', name: 'gitee.com' },
  { value: 'gitlab.com', name: 'gitlab.com' },
  { value: 'cnb.cool', name: 'cnb.cool' },
  { value: 'gitcode.com', name: 'gitcode.com' },
  { value: 'bitbucket.org', name: 'bitbucket.org' },
  { value: 'gitea.com', name: 'gitea.com' },
  { value: '__custom__', name: '其他（手动输入）' },
];
// 自动开启签名配置项（仅存储值，是否执行由调用方决定）
export const GPG_AUTO_COMMIT_SIGN = false;
// 加密方式下拉选项（gpg --quick-generate-key 的 algo 参数）
export const GPG_ALGORITHMS = [
  { value: 'ed25519', name: 'ed25519（密钥更小、签名更快，默认）' },
  { value: 'rsa4096', name: 'rsa4096' },
  { value: 'rsa3072', name: 'rsa3072' },
  { value: 'rsa2048', name: 'rsa2048' },
];
