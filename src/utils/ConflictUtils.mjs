import { readFileSync } from 'fs';

/**
 * 查找冲突文件
 */
export const findConflictFiles = (paths, workingPrefix = '') => {
  const conflictFiles = [];
  const ignoreFiles = [];
  const pathsCopy = [...paths];

  while (pathsCopy.length) {
    const p = pathsCopy.shift();

    // 如果有 workingPrefix，检查文件是否在当前工作目录下
    // p 是相对于 Git 根目录的路径，workingPrefix 也是相对于 Git 根目录的路径
    if (workingPrefix && !p.startsWith(workingPrefix)) {
      ignoreFiles.push(p);
      continue;
    }

    try {
      const content = readFileSync(p, 'utf8');
      // 检查是否有 git 冲突标记
      // 仅当冲突标记出现在行首时才判定为真实冲突，避免代码字符串中的误判
      const hasStartMarker = /^<<<<<<< [^\n\r]*/m.test(content);
      const hasMidMarker = /^=======$/m.test(content);
      const hasEndMarker = /^>>>>>>> [^\n\r]*/m.test(content);

      if (hasStartMarker && hasMidMarker && hasEndMarker) {
        conflictFiles.push(p);
      }
    } catch (error) {
      // 文件读取失败，可能是被忽略的文件
      ignoreFiles.push(p);
    }
  }

  return { conflictFiles, ignoreFiles };
};
