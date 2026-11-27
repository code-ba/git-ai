// ========== GPG 密钥生成配置 ==========
// 公钥导出目录（基于用户主目录，即 ~/.config/git-ai/cli/gpg）
export const GPG_EXPORT_DIR = '.config/git-ai/cli/gpg';
// 签名提交配置项（仅存储值，是否执行由调用方决定）
export const GPG_AUTO_COMMIT_SIGN = false;
// 加密方式下拉选项（gpg --quick-generate-key 的 algo 参数）
export const GPG_ALGORITHMS = [
  { value: 'ed25519', name: 'ed25519（密钥更小、签名更快，默认）' },
  { value: 'rsa4096', name: 'rsa4096' },
  { value: 'rsa3072', name: 'rsa3072' },
  { value: 'rsa2048', name: 'rsa2048' },
];
