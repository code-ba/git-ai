/**
 * 获取操作系统语言标签（BCP 47，如 zh-CN、en-US）
 * 优先读取环境变量（Linux/macOS），Windows 下回退到 Node ICU 解析的系统 locale
 * @returns {string} 语言标签
 */
export const getOSLocale = () => {
  const envLang = (process.env.LC_ALL || process.env.LANG || process.env.LANGUAGE || '')
    .split(':')[0]
    .split('.')[0]
    .replace('_', '-');
  if (envLang) return envLang;
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch (e) {
    return 'en-US';
  }
};

/**
 * 获取操作系统语言名称（用该语言自身显示，如 中文、English）
 * @returns {string} 语言名称，获取失败时回退为语言标签
 */
export const getOSLanguage = () => {
  const locale = getOSLocale();
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) || locale;
  } catch (e) {
    return locale;
  }
};
