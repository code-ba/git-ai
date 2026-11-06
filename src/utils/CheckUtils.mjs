import { existsSync } from 'fs';
import { stat as statAsync } from 'fs/promises';
import { join } from 'path';
import {
  DEPENDENCY_DIR_NAMES,
  CACHE_DIR_NAMES,
  CACHE_FILE_PATTERNS,
  BUILD_DIR_NAMES,
  ARCHIVE_FILE_PATTERNS,
  LARGE_FILE_WARN_SIZE,
  LARGE_FILE_CONFIRM_SIZE,
} from '../const.mjs';

/**
 * 格式化文件大小
 * @param {number} size - 文件字节数
 * @returns {string} 如 12.3M、512.0K、128B
 */
export const formatFileSize = (size = 0) => {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)}M`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)}K`;
  }
  return `${size}B`;
};

/**
 * 检测 .gitignore 文件是否存在
 * @param {string} repoRoot - Git 仓库根目录
 * @returns {boolean} 是否存在
 */
export const checkGitignoreExists = (repoRoot = '') => {
  try {
    return existsSync(join(repoRoot || process.cwd(), '.gitignore'));
  } catch (error) {
    // 检测失败时不告警，避免阻断流程
    return true;
  }
};

/**
 * 将含 '*' 通配符的名称转为正则（不区分大小写），'*' 可在任意位置
 * 如 '.tmp*' -> /^\.tmp.*$/i、'*.log' -> /^.*\.log$/i
 */
const wildCardNameToRegExp = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');

/**
 * 通用文件收集器：按目录名 / 文件名模式匹配文件列表
 * 目录名与路径中的任一段匹配即可命中，与层级无关（根目录和子目录均可）；
 * 目录名与文件名均支持 '*' 通配符（可在任意位置），不含 '*' 时为精确匹配（不区分大小写）
 * @param {string[]} files - 文件路径列表（相对仓库根目录，使用 / 分隔）
 * @param {string[]} dirNames - 目录名列表，如 ['node_modules', '.tmp*']
 * @param {string[]} [filePatterns] - 文件名模式列表，如 ['*.log', '.DS_Store']
 * @returns {{ dirs: Array<{dir: string, count: number}>, files: string[] }}
 *   dirs: 按命中目录聚合的结果，如 { dir: 'project/node_modules', count: 120 }
 *   files: 命中的文件路径列表
 */
export const findFilesByPattern = (files = [], dirNames = [], filePatterns = []) => {
  const exactDirNames = new Set(dirNames.filter((name) => !name.includes('*')));
  const dirNameRegExpList = dirNames.filter((name) => name.includes('*')).map(wildCardNameToRegExp);
  const exactFileNames = new Set(
    filePatterns.filter((pattern) => !pattern.includes('*')).map((pattern) => pattern.toLowerCase())
  );
  const fileNameRegExpList = filePatterns
    .filter((pattern) => pattern.includes('*'))
    .map(wildCardNameToRegExp);
  const dirMap = new Map();
  const matched = [];

  files.forEach((file) => {
    const segments = file.split('/');
    const name = segments[segments.length - 1];
    // 目录匹配只看文件名之前的路径段，避免文件名本身被当作目录命中
    const dirIndex = segments
      .slice(0, -1)
      .findIndex(
        (segment) => exactDirNames.has(segment) || dirNameRegExpList.some((re) => re.test(segment))
      );
    const fileMatched =
      exactFileNames.has(name.toLowerCase()) || fileNameRegExpList.some((re) => re.test(name));
    if (dirIndex === -1 && !fileMatched) {
      return;
    }
    // 取命中目录所在层级的路径前缀，如 project/node_modules
    const dir = dirIndex !== -1 ? segments.slice(0, dirIndex + 1).join('/') : '';
    matched.push(file);
    if (dir) {
      dirMap.set(dir, (dirMap.get(dir) || 0) + 1);
    }
  });

  const dirs = Array.from(dirMap.entries()).map(([dir, count]) => ({ dir, count }));
  return { dirs, files: matched };
};

/**
 * 检测文件列表中的依赖包文件
 * @param {string[]} files - 文件路径列表（相对仓库根目录，使用 / 分隔）
 * @returns {{ depDirs: Array<{dir: string, count: number}>, depFiles: string[] }}
 *   depDirs: 按依赖目录聚合的结果，如 { dir: 'node_modules', count: 3 }、{ dir: 'project/node_modules', count: 120 }
 *   depFiles: 命中的文件路径列表
 */
export const findDependencyFiles = (files = []) => {
  const { dirs, files: depFiles } = findFilesByPattern(files, DEPENDENCY_DIR_NAMES);
  return { depDirs: dirs, depFiles };
};

/**
 * 检测文件列表中的缓存/临时/系统垃圾文件
 * 注：测试源码（test/、*.spec.js 等）属于应提交内容，不做检测；测试产物（coverage 等）归入缓存目录
 * @param {string[]} files - 文件路径列表（相对仓库根目录，使用 / 分隔）
 * @returns {{ dirs: Array<{dir: string, count: number}>, files: string[] }}
 */
export const findCacheFiles = (files = []) =>
  findFilesByPattern(files, CACHE_DIR_NAMES, CACHE_FILE_PATTERNS);

/**
 * 检测文件列表中的构建产物目录与压缩包文件
 * 依赖目录内的构建产物/压缩包已由依赖包检测覆盖，不重复列出
 * @param {string[]} files - 文件路径列表（相对仓库根目录，使用 / 分隔）
 * @returns {{ dirs: Array<{dir: string, count: number}>, files: string[] }}
 */
export const findBuildArtifacts = (files = []) => {
  const { dirs, files: matched } = findFilesByPattern(
    files,
    BUILD_DIR_NAMES,
    ARCHIVE_FILE_PATTERNS
  );
  const isUnderDependencyDir = (file) =>
    file.split('/').some((segment) => DEPENDENCY_DIR_NAMES.includes(segment));
  return {
    dirs: dirs.filter((item) => !isUnderDependencyDir(item.dir)),
    files: matched.filter((file) => !isUnderDependencyDir(file)),
  };
};

/**
 * 检测文件列表中的大文件（异步并发 stat，避免大量文件时阻塞界面）
 * @param {string[]} files - 文件路径列表（相对仓库根目录）
 * @param {string} repoRoot - Git 仓库根目录，用于拼接绝对路径
 * @returns {Promise<{ warnFiles: Array<{file: string, size: number}>, confirmFiles: Array<{file: string, size: number}> }>}
 *   warnFiles: 超过警告阈值 LARGE_FILE_WARN_SIZE 的文件
 *   confirmFiles: 超过确认阈值 LARGE_FILE_CONFIRM_SIZE 的文件
 */
export const findLargeFiles = async (files = [], repoRoot = '') => {
  const results = await Promise.all(
    files.map(async (file) => {
      try {
        const filePath = repoRoot ? join(repoRoot, file) : file;
        const { size } = await statAsync(filePath);
        return { file, size };
      } catch (error) {
        // 文件可能已被删除（如重命名的旧路径），忽略
        return null;
      }
    })
  );

  const warnFiles = [];
  const confirmFiles = [];
  results.forEach((item) => {
    if (!item) return;
    if (item.size > LARGE_FILE_CONFIRM_SIZE) {
      confirmFiles.push(item);
    } else if (item.size > LARGE_FILE_WARN_SIZE) {
      warnFiles.push(item);
    }
  });

  return { warnFiles, confirmFiles };
};
