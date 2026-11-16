// ========== 提交前检查配置 ==========
// 整体流程：git add 前 .gitignore 检测（告警）→ commit 前依次：
//   缓存/临时/垃圾文件（告警）→ 依赖包目录（确认）→ 构建产物/压缩包（确认）→ 大文件（5M 告警 / 100M 确认）
// 各开关默认开启；确认级取消会中止提交，告警级仅提示
// 是否检测 .gitignore 文件（git add 之前）
export const CHECK_GITIGNORE_ENABLE = true;
// 是否检测依赖包目录（commit 时）
export const CHECK_DEPENDENCIES_ENABLE = true;
// 是否检测大文件（commit 时）
export const CHECK_LARGE_FILES_ENABLE = true;
// 大文件警告阈值：5M
export const LARGE_FILE_WARN_SIZE = 5 * 1024 * 1024;
// 大文件确认阈值：100M
export const LARGE_FILE_CONFIRM_SIZE = 100 * 1024 * 1024;
// execSync 默认 maxBuffer 仅 1MB，超大仓库的 status/ls-files/stat 等输出（随文件数线性增长）会超限，
// 统一放宽到 50M（约可容纳百万级文件的列表输出）
export const EXEC_MAX_BUFFER_SIZE = 50 * 1024 * 1024;
// 常见依赖包目录名（按路径中的任一段匹配），可按需维护
// 注意：不要加入 env、packages、deps 等过于通用的名称，容易误伤正常源码目录
// （如 monorepo 的 packages/ 通常是业务源码）
export const DEPENDENCY_DIR_NAMES = [
  // Node.js / 前端
  'node_modules',
  'bower_components',
  '.yarn', // Yarn 2+ 依赖缓存
  // Python
  'venv',
  '.venv',
  'site-packages',
  '__pycache__',
  '.tox',
  '.nox',
  // PHP / Go / Ruby vendor 目录
  'vendor',
  // Java / Gradle 项目缓存
  '.gradle',
  // iOS / macOS
  'Pods',
  'Carthage',
  'DerivedData',
  // Swift / Elixir / Haskell
  '.build',
  '_build',
  '.stack-work',
  'dist-newstyle',
  // Dart / Flutter
  '.dart_tool',
  // Elm
  'elm-stuff',
  // Terraform 模块与插件缓存
  '.terraform',
  // C/C++ 第三方源码目录
  'third_party',
  'third-party',
  '3rdparty',
];
// 是否检测缓存/临时/系统垃圾文件（commit 时，仅告警不阻断）
export const CHECK_CACHE_FILES_ENABLE = true;
// 常见缓存/临时目录名，仅告警不阻断（.next/.nuxt 等构建缓存也归此类；需确认的构建产物见 BUILD_DIR_NAMES）
// 注：测试源码（test/、*.spec.js 等）属于应提交内容，不做检测；测试产物（coverage 等）归入此处
export const CACHE_DIR_NAMES = [
  'coverage', // 测试覆盖率报告
  '.nyc_output',
  '.cache',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.sass-cache',
  '.parcel-cache',
  '.next', // Next.js 构建产物
  '.nuxt',
  '.turbo',
  '.vite',
  'tmp',
  'temp',
  'logs',
  'playwright-report', // Playwright 测试报告
  'test-results', // Playwright 测试产物
  '.docusaurus', // Docusaurus 构建缓存
  '.tmp*', // 临时目录，如 .tmp-hugefirst、.tmp-xdg
];
// 常见缓存/垃圾文件名模式（'*' 可在任意位置，否则全名匹配），可按需维护
export const CACHE_FILE_PATTERNS = [
  '.DS_Store', // macOS
  'Thumbs.db', // Windows
  'desktop.ini',
  '*.log',
  '*.tmp',
  '*.swp', // vim 交换文件
  '.eslintcache',
  '.tmp*', // 临时文件，如 .tmp-test-init.mjs
];

// 是否检测构建产物目录与压缩包文件（commit 时，需用户确认）
export const CHECK_BUILD_ARTIFACTS_ENABLE = true;
// 常见构建产物目录名，需用户确认，可按需维护
// 误伤风险高、不建议加入的通用名：bin（脚本目录）、lib（常见源码目录）、
// packages（monorepo 源码）、es/umd、Debug/Release/x64、generated（可能故意提交）
export const BUILD_DIR_NAMES = [
  'dist', // 通用构建输出（Vite/Webpack/uni-app 等）
  'unpackage', // uni-app 编译输出
  'miniprogram_npm', // 微信小程序构建 npm
  'out', // Next.js 导出 / TypeScript / Electron 构建输出
  '.output', // Nuxt 3 构建输出
  '.svelte-kit', // SvelteKit 构建产物
  'storybook-static', // Storybook 静态构建
  'target', // Maven / Rust 构建输出
  'obj', // .NET 编译中间产物
  'cmake-build-debug', // CLion 构建输出
  'cmake-build-release',
  'release', // electron-builder 等打包输出
];
// 常见压缩包文件后缀，可按需维护（如需拦截 *.jar/*.war 可自行添加）
export const ARCHIVE_FILE_PATTERNS = [
  '*.zip',
  '*.rar',
  '*.7z',
  '*.tar',
  '*.gz',
  '*.tgz',
  '*.bz2',
  '*.xz',
  '*.zst',
];

// 仓库本地配置键：跳过大文件确认（记录在 .git/config，仅对当前仓库生效）
export const SKIP_LARGE_FILE_CONFIRM_KEY = 'git-ai.skip-large-file-confirm';
