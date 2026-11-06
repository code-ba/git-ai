import axios from 'axios';
import { config } from './Storage.mjs';
import { OPENAI_TIMEOUT } from '../const.mjs';
import { getOpenAiConfig } from './Utils.mjs';

export const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
};
/**
 * 获取模型列表：GET /models（OpenAI 风格接口，Bearer 鉴权）
 * 注意：anthropic 类型使用 x-api-key 鉴权，此请求可能失败；
 * init 的 model 步骤已对该情况做降级处理（回退为手动输入）
 */
export const getModelList = (options) => {
  const conf = {};
  const baseURL = config.get('baseURL').split(',')[0];
  const key = config.get('key');
  if (key) {
    conf['Authorization'] = `Bearer ${key.split(',')[0]}`;
  }
  return axios({
    url: `/models`,
    method: 'get',
    baseURL,
    headers: {
      ...headers,
      ...conf,
    },
    ...options,
  }).then((res) =>
    res.data.data
      .filter(
        (item) =>
          !item.id.toLocaleLowerCase().includes('embedding') &&
          !item.id.toLocaleLowerCase().includes('reranker')
      )
      .map((item) => ({ ...item, value: item.id, name: item.id }))
  );
};

/**
 * 读取请求类型配置
 * - init 时可选择 chat / responses / anthropic，存储在配置 requestType
 * - 未配置（旧版本用户）默认返回 chat，即旧的请求方式，保证向后兼容
 */
const getRequestType = () => config.get('requestType') || 'chat';

/**
 * 读取 maxToken 配置（数字），未配置或非法时返回 undefined
 * responses / anthropic 接口需要显式传输出上限，否则部分服务默认只输出很少 token
 */
const getMaxToken = () => {
  const maxToken = parseInt(config.get('maxToken'));
  return Number.isFinite(maxToken) && maxToken > 0 ? maxToken : undefined;
};

/**
 * chat 请求体：POST /chat/completions
 * messages 原样透传，保持旧的请求行为不变
 */
const buildChatRequest = (data) => ({
  url: `/chat/completions`,
  data: {
    think: false,
    stream: false,
    thinking: { type: 'disabled' },
    model: data.model || getOpenAiConfig('model'),
    ...data,
  },
});

/**
 * anthropic 请求体：POST /v1/messages（Anthropic Claude 系列）
 * - system 是顶层字段，不在 messages 里；messages 只允许 user / assistant
 * - max_tokens 为必填项，未配置 maxToken 时兜底 4096（多数 Claude 模型的安全输出上限）
 */
const buildAnthropicRequest = (data, baseURL) => {
  const { messages = [], ...rest } = data;
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  // Anthropic 官方地址为 {host}/v1/messages；baseURL 已以 /v1 结尾时（与 chat 配置习惯一致）直接拼 /messages
  const url = /\/v1\/?$/.test(baseURL || '') ? `/messages` : `/v1/messages`;
  return {
    url,
    data: {
      stream: false,
      model: data.model || getOpenAiConfig('model'),
      max_tokens: getMaxToken() || 4096,
      ...(system ? { system } : {}),
      messages: messages.filter((m) => m.role !== 'system'),
      ...rest,
    },
  };
};

/**
 * responses 请求体：POST /responses（新版 Responses 接口）
 * - input 直接支持 [{ role, content }] 消息数组
 * - 输出上限参数名为 max_output_tokens
 */
const buildResponsesRequest = (data) => {
  const { messages = [], ...rest } = data;
  return {
    url: `/responses`,
    data: {
      stream: false,
      model: data.model || getOpenAiConfig('model'),
      input: messages,
      max_output_tokens: getMaxToken(),
      ...rest,
    },
  };
};

/**
 * 响应归一化：三种请求类型的响应统一转成 chat completions 结构
 * （choices[0].message.content），上层 AIService / formatCompletions 无需感知差异
 */

// chat 响应本身就是该结构，原样返回
const normalizeChatResponse = (res) => res;

// anthropic 响应：content 块数组（type: 'text'）-> choices[0].message.content
// 同时把 usage（input_tokens/output_tokens）映射为 chat 风格，便于上层统一展示消耗统计
const normalizeAnthropicResponse = (res) => {
  const data = res.data || {};
  const text = Array.isArray(data.content)
    ? data.content
        .filter((c) => c && c.type === 'text')
        .map((c) => c.text || '')
        .join('')
    : '';
  return {
    ...res,
    data: {
      ...data,
      usage: data.usage
        ? {
            ...data.usage,
            prompt_tokens: data.usage.input_tokens,
            completion_tokens: data.usage.output_tokens,
            total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
          }
        : data.usage,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: text },
          finish_reason: data.stop_reason || 'stop',
        },
      ],
    },
  };
};

// responses 响应：优先取服务端聚合的 output_text，否则遍历 output 提取 output_text 内容项
const normalizeResponsesResponse = (res) => {
  const data = res.data || {};
  let text = data.output_text;
  if (!text && Array.isArray(data.output)) {
    text = data.output
      .filter((item) => item.type === 'message')
      .flatMap((item) =>
        (item.content || []).filter((c) => c.type === 'output_text').map((c) => c.text)
      )
      .join('');
  }
  return {
    ...res,
    data: {
      ...data,
      choices: [
        { index: 0, message: { role: 'assistant', content: text || '' }, finish_reason: 'stop' },
      ],
    },
  };
};

/**
 * 请求类型 -> 请求体构建 / 响应归一化 处理器映射
 */
const REQUEST_TYPE_HANDLERS = {
  chat: { build: buildChatRequest, normalize: normalizeChatResponse },
  responses: { build: buildResponsesRequest, normalize: normalizeResponsesResponse },
  anthropic: { build: buildAnthropicRequest, normalize: normalizeAnthropicResponse },
};

/**
 * 按请求类型构建鉴权头
 * - anthropic：x-api-key + anthropic-version（Anthropic 官方鉴权方式，不使用 Bearer Token）
 * - 其余（chat / responses）：Authorization Bearer Token（OpenAI 兼容）
 */
const buildAuthHeaders = (requestType, key) => {
  if (requestType === 'anthropic') {
    return { ...headers, 'x-api-key': key || '', 'anthropic-version': '2023-06-01' };
  }
  return { ...headers, Authorization: key ? `Bearer ${key}` : `` };
};

/**
 * AI 请求统一入口（沿用 chat 命名，调用方 AIService / SelectModelAction 无需改动）
 * 按配置 requestType 分发到常用的三种请求类型：
 *  - chat（默认）：POST /chat/completions；用户未设置类型（旧版本用户）时走此分支，即旧的请求方式
 *  - responses：POST /responses
 *  - anthropic：POST /v1/messages
 * 各类型响应统一归一化为 chat completions 结构后再返回
 */
export const chat = (data, baseURL, apiKey) => {
  const requestType = getRequestType();
  const handler = REQUEST_TYPE_HANDLERS[requestType] || REQUEST_TYPE_HANDLERS.chat;
  const key = apiKey || getOpenAiConfig('key');
  const effectiveBaseURL = baseURL || getOpenAiConfig('baseURL');
  const { url, data: body } = handler.build(data, effectiveBaseURL);
  return axios({
    url,
    method: 'post',
    baseURL: effectiveBaseURL,
    headers: buildAuthHeaders(requestType, key),
    timeout: OPENAI_TIMEOUT,
    data: body,
  }).then(handler.normalize);
};
