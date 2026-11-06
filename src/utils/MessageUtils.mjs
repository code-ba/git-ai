import { BREAKING_CHANGE_MARKERS, OPENAI_COMMIT_MESSAGE_TYPES } from '../const.mjs';
import { getOSLanguage } from './LanguageUtils.mjs';

/**
 * 清洗模型原始输出：去掉推理模型的思考内容、代码块围栏、--- 分隔符与模板占位符
 */
const cleanRawOutput = (message) => {
  let text = message.includes('</think>')
    ? message.slice(message.indexOf('</think>') + '</think>'.length).trim()
    : message.trim();
  return text
    .replace(/```[a-z]*\n?/g, '')
    .replace(/---/g, '')
    .replace(/\n<BLANK LINE>\n/g, '\n\n')
    .replace(/\n<body>\n/g, '\n\n')
    .replace(/\nbody\n/g, '\n\n')
    .trim();
};

/**
 * 解析提交消息（借鉴 langchain RegexParser）
 * 用捕获组解析出 { type, breaking, scope, subject, body }，格式由 buildCommitMessage 拼装保证
 * 解析失败抛错并携带原始文本，供上层走自动修复链路（借鉴 OutputFixingParser）
 */
export const parseCommitMessage = (message) => {
  const text = cleanRawOutput(message);
  // (!?) 捕获破坏性变更标记：<type>(<scope>)!: <subject>
  const regex = new RegExp(
    `^(${OPENAI_COMMIT_MESSAGE_TYPES.join('|')})\\(([^)]*)\\)(!?):[ \\t]*(.+)$`,
    'm'
  );
  const match = text.match(regex);
  if (!match) {
    throw new Error(`Could not parse output: ${text}`);
  }
  // body：header 行之后按空行分段，过滤注释段与模板占位符段，最多保留 2 段
  const body = text
    .slice(match.index + match[0].length)
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(
      (para) =>
        para.length > 0 &&
        !para.startsWith('// ') &&
        !/^(<BLANK LINE>|<(type|scope|subject|body|footer)>|\[(type|scope|subject|body|footer)\]|body|footer)$/i.test(
          para
        )
    )
    .slice(0, 2)
    .join('\n\n');
  return {
    type: match[1],
    breaking: match[3] === BREAKING_CHANGE_MARKERS[0],
    scope: match[2].trim(),
    subject: match[4].trim(),
    body,
  };
};

/**
 * 拼装提交消息（借鉴 langchain withStructuredOutput 思路：格式合法性由代码保证）
 */
export const buildCommitMessage = ({ type, breaking, scope, subject, body }) => {
  // 破坏性变更标记 ! 位于 scope 括号之后、冒号之前：<type>(<scope>)!: <subject>
  const header = `${type}(${scope})${breaking ? BREAKING_CHANGE_MARKERS[0] : ''}: ${subject}`;
  return body ? `${header}\n\n${body}` : header;
};

/**
 * 生成系统消息
 */
export const generateSystemMessage = () => {
  const language = getOSLanguage();
  return `您是一个${language}提交消息生成器。根据差异字符串生成恰好一条提交消息，只输出消息本身，不要解释、前后缀或代码块包裹。

格式：
<type>(<scope>): <subject>
（空行）
<body>
（空行）
<footer>

规则：
1. <type> 只能是：${OPENAI_COMMIT_MESSAGE_TYPES.join('、')}
2. <scope> 由你根据差异内容分析生成，简洁的小写英文单词或短语（模块名、文件名或功能域），不允许为空
3. <subject> 用${language}书写，祈使句现在时，不超过 50 个字符，结尾不加句号
4. <body> 可选，最多 1 段，说明改动动机与要点
5. <footer> 可选，仅用于破坏性变更或关联 issue
6. 破坏性变更：在 <type>(<scope>) 后紧跟 ${
    BREAKING_CHANGE_MARKERS[0]
  }（即 <type>(<scope>)!: <subject>），并在 footer 以 ${BREAKING_CHANGE_MARKERS[1]} 开头说明原因
7. 消息中不要使用 --- 分隔线

示例：
fix(auth): 修复令牌过期后未跳转登录页的问题

登录态过期时仅刷新了本地存储，未触发路由跳转，导致用户停留在空白页。现在在响应拦截器中统一处理 401 并跳转登录页。

BREAKING CHANGE: 移除 login() 的第二个参数，改用 options 对象传参`;
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
