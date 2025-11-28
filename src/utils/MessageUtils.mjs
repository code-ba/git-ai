import { OPENAI_COMMIT_MESSAGE_TYPES } from '../const.mjs';

/**
 * 获取前几段内容
 */
const getFirstParagraphs = (newStr, paragraphCount = 3) => {
  const normalizedText = newStr
    .replace(/\r\n?|\n/g, '\n')
    .replace(/\n<BLANK LINE>\n/g, '\n\n')
    .replace(/\n<body>\n/g, '\n\n')
    .replace(/\nbody\n/g, '\n\n');
  const newStrList = normalizedText.split('\n-');
  const str = newStrList
    .map((item, index) => {
      if (!index) return item;
      if (item.startsWith(' ') && item.endsWith('\n')) return item.slice(1, -1);
      return item;
    })
    .join('\n-');
  const paragraphs = str
    .split(/\n\s*\n/)
    .filter((para) => para.trim().length > 0 && !para.startsWith('// '))
    .slice(0, paragraphCount);
  return paragraphs.join('\n\n');
};

/**
 * 格式化提交消息
 */
export const formatMessage = (message, OPENAI_COMMIT_MESSAGE_REGEXP) => {
  // 判断是否为推理模型,去掉 think 标签
  let newStr = message.includes('</think>')
    ? message.replace('</think>', '').trim()
    : message.trim();
  while (newStr && !OPENAI_COMMIT_MESSAGE_REGEXP.test(newStr)) {
    newStr = newStr.slice(1);
  }
  // 判断是否包含 ```
  if (newStr.includes('```')) {
    const arr = newStr.split('```').filter((e) => e != '');
    newStr = arr[0];
  }
  if (newStr.includes('---')) {
    const arr = newStr.split('---').filter((e) => e != '');
    newStr = arr[0];
  }
  return getFirstParagraphs(getFirstParagraphs(newStr), 2).trim();
};

/**
 * 生成系统消息
 */
export const generateSystemMessage = (scope) => {
  return `您是一个提交消息生成器，通过差异字符串创建恰好一条提交消息，不添加不必要的信息！以下是来自 https://karma-runner.github.io/6.4/dev/git-commit-msg.html 指南的良好提交消息格式：
  
  ---
  <type>(${scope}): <subject>
  <BLANK LINE>
  <body>
  ---
  
  (${scope})是固定值不允许修改，允许的 <type> 值有 ${OPENAI_COMMIT_MESSAGE_TYPES.join(
    '、'
  )}。以下是一个良好提交消息的中文示例：
  
  ---
  fix(${scope}): <subject>
  
  <BLANK LINE>
  
  <body>
  ---`;
};

/**
 * 解析流式数据
 */
const parseStreamData = (data) => {
  if (!data || typeof data !== 'string') return [];
  // 标准化换行，兼容 \r\n 并移除多余空白
  const lines = data.replace(/\r\n?/g, '\n').split('\n');
  const chunks = lines
    .map((line) => line.trim())
    // 仅保留以 data: 开头的 SSE 行（允许可选空格）
    .filter((line) => /^data:\s*/.test(line))
    // 提取 data: 之后的负载
    .map((line) => line.replace(/^data:\s*/, ''))
    // 忽略结束标记
    .filter((payload) => payload && payload !== '[DONE]')
    // 仅尝试解析形如 JSON 的负载
    .map((payload) => {
      if (payload[0] !== '{' && payload[0] !== '[') return null;
      try {
        return JSON.parse(payload);
      } catch (e) {
        console.error('解析JSON失败:', e);
        return null;
      }
    })
    .filter(Boolean); // 过滤掉解析失败的数据

  // 若没有有效块，返回空对象
  if (!chunks.length) return {};

  // 将多段 SSE 合并为一个 JSON（聚合 choices.delta.content）
  const merged = chunks.reduce((acc, cur) => {
    if (!acc) {
      acc = {
        id: cur.id,
        object: 'chat.completion',
        created: cur.created,
        model: cur.model,
        system_fingerprint: cur.system_fingerprint,
        choices: [],
      };
    }
    // 元信息尽量沿用最新
    acc.id = cur.id || acc.id;
    acc.created = cur.created || acc.created;
    acc.model = cur.model || acc.model;
    acc.system_fingerprint = cur.system_fingerprint || acc.system_fingerprint;

    if (Array.isArray(cur.choices)) {
      cur.choices.forEach((choice) => {
        const idx = typeof choice.index === 'number' ? choice.index : 0;
        if (!acc.choices[idx]) {
          acc.choices[idx] = {
            index: idx,
            message: { role: 'assistant', content: '' },
            finish_reason: null,
          };
        }
        const target = acc.choices[idx];

        // 兼容两种返回：stream delta 与 非 stream message
        if (choice.delta) {
          const { role, content, reasoning_content } = choice.delta;
          if (role && (!target.message.role || target.message.role === 'assistant')) {
            target.message.role = role;
          }
          if (typeof content === 'string') {
            target.message.content += content;
          }
          // 如果需要保留推理，可附加在末尾或放入扩展字段
          if (typeof reasoning_content === 'string') {
            target.reasoning_content = (target.reasoning_content || '') + reasoning_content;
          }
        }
        if (choice.message && typeof choice.message.content === 'string') {
          // 非流式一次性结果
          target.message = {
            role: choice.message.role || target.message.role || 'assistant',
            content: choice.message.content,
          };
        }
        if (choice.finish_reason) {
          target.finish_reason = choice.finish_reason;
        }
      });
    }
    return acc;
  }, null);

  // 清理 undefined 空洞
  merged.choices = merged.choices.filter(Boolean);
  return merged;
};

/**
 * 格式化完成结果
 */
export const formatCompletions = (result) => {
  if (typeof result.data === 'string') {
    const data = parseStreamData(result.data);
    // 兼容：如果旧实现返回数组，取最后一项
    if (Array.isArray(data)) {
      return data[data.length - 1].choices[0].message.content;
    }
    // 新实现：合并为一个 JSON
    if (data && data.choices && data.choices.length) {
      const choice = data.choices[0];
      if (choice && choice.message && typeof choice.message.content === 'string') {
        return choice.message.content;
      }
    }
    throw new Error('流式结果解析失败，未获取到内容');
  }
  return result.data.choices[0].message.content;
};
