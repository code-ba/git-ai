export const OPENAI_TIMEOUT = 60 * 1000 * 3;
export const OPENAI_MAX_TOKEN_DEFAULT = 128000;
/**
 * 常用三种 AI 请求类型（init 时选择，存储在配置 requestType）
 * - chat: OpenAI 兼容 /chat/completions（默认；旧版本用户未配置 requestType 时，请求端也兜底走 chat）
 * - responses: OpenAI /responses（新版 Responses 接口）
 * - anthropic: Anthropic /v1/messages（Claude 系列接口，x-api-key 鉴权）
 */
export const AI_REQUEST_TYPES = [
  { value: 'chat', name: 'chat - /chat/completions（OpenAI 兼容，默认）' },
  { value: 'responses', name: 'responses - /responses（OpenAI Responses）' },
  { value: 'anthropic', name: 'anthropic - /v1/messages（Anthropic Claude）' },
];
export const OPENAI_COMMIT_MESSAGE_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
];

// 标准破坏性变更标记（conventional commits 规范）
// - '!': header 中 <type>(<scope>)! 后缀标记
// - 'BREAKING CHANGE:' / 'BREAKING-CHANGE:': footer 中的描述标记
export const BREAKING_CHANGE_MARKERS = ['!', 'BREAKING CHANGE:', 'BREAKING-CHANGE:'];
