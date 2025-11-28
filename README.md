# @git-ai/cli

[![npm version](https://img.shields.io/npm/v/@git-ai/cli.svg?logo=npm)](https://www.npmjs.com/package/@git-ai/cli)
[![npm downloads](https://img.shields.io/npm/dm/@git-ai/cli.svg)](https://www.npmjs.com/package/@git-ai/cli)
[![Build Status](https://img.shields.io/github/actions/workflow/status/code-ba/git-ai/publish.yml?branch=main&logo=github)](https://github.com/code-ba/git-ai/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个基于 AI 的 Git 提交消息生成器 CLI 工具，可自动分析代码变更并生成符合规范的提交信息。

## ✨ 特性

- 🤖 **AI 自动生成提交消息** - 基于代码变更自动生成符合规范的 commit message
- 🔄 **完整的 Git 工作流** - 自动执行 `git add`、`git commit`、`git fetch`、`git merge`、`git push`
- 🛡️ **冲突检测** - 自动检测 Git 冲突和代码冲突标记
- 🔍 **AI 诊断** - 当 commit 失败时，AI 自动分析失败原因并提供解决方案
- ⚙️ **灵活配置** - 支持配置多个 API 端点、模型和密钥
- 🎯 **符合规范** - 生成的提交消息符合常见的 commit message 规范（feat、fix、docs 等）
- 🚀 **开箱即用** - 支持免费 API，无需配置即可使用

## 📦 安装

```bash
npm install -g @git-ai/cli
```

## 🚀 快速开始

### 1. 基本使用（使用免费 API）

无需配置，直接使用：

```bash
git ai
```

工具会自动：

- 检查 Git 环境
- 执行 `git add .`
- 分析代码变更
- 使用 AI 生成提交消息
- 执行 `git commit`
- 执行 `git fetch` 和 `git merge`（如有需要）
- 执行 `git push`

**运行示例：**

```bash
$ git ai
git-ai verb @git-ai/cli@1.0.0
git-ai verb 按 Ctrl+C 退出...
git-ai success AI 生成的内容：
docs(John): 更新文档和代码格式规范

- 添加了 select-model 命令的环境变量配置说明
- 统一了代码中的引号使用为双引号
- 修复了 package.json 中缺少的 access 字段
- 规范化了代码缩进和格式
git-ai info 本次模型消耗统计：总数 17050 tokens、输入 16977 tokens、输出 73 tokens
git-ai success git commit 提交成功...
git-ai info 获取 git 远程仓库地址
git-ai success 获取 git 远程仓库地址成功
git-ai info 获取远程仓库最新状态，执行 git fetch...
git-ai success 远程分支 origin 的最新更改状态获取成功
git-ai info 正在检测是否需要拉取...
git-ai success 本地代码是最新，无需合并
git-ai info 正在推送本地分支与远程分支的差异...
git-ai success 本地分支与远程分支的差异已推送。
git-ai verb 日志地址: C:\Users\用户名\.config\git-ai\cli\logs\2025-11\log-2025-11-22_10-56-59.txt
git-ai verb 本次执行指令耗时: 14.481 秒，程序退出...
```

### 2. 配置自定义 API（可选）

如果你有自己的 OpenAI compatible API，可以配置：

```bash
# 设置 API Base URL
git ai set-baseURL https://api.siliconflow.cn/v1

# 设置 API Key
git ai set-key your-api-key

# 设置模型（支持多个，用逗号分隔）
git ai set-model gpt-4,claude-3

# 或者从模型列表中选择（需要配置 OPENAI_MODEL_LIST_URL 环境变量）
git ai select-model
```

**注意：** 使用 `select-model` 命令前，需要先设置 `OPENAI_MODEL_LIST_URL` 环境变量指向模型列表配置文件（详见下方命令说明）。

### 3. 设置最大 Token 数

如果代码变更较大，可以调整最大 token 数：

```bash
git ai set-max-token 128000
```

## 📖 命令说明

### 主命令

```bash
git ai [选项]
```

自动生成提交消息并执行完整的 Git 工作流。

**选项：**

- `-d, --dry-run` - 等同于 `git commit --dry-run -m <message>`，只测试不实际提交
- `-e, --allow-empty` - 等同于 `git commit --allow-empty -m <message>`，允许空提交
- `-n, --no-verify` - 等同于 `git commit --no-verify -m <message>`，跳过 Git hooks
- `-s, --skip` - 跳过 `git add` 命令，只提交已暂存的更改

### 配置命令

#### `set-baseURL [baseURL]`

设置 OpenAI compatible Base URL。

```bash
git ai set-baseURL https://api.siliconflow.cn/v1
```

支持多个 URL，用英文逗号分隔：

```bash
git ai set-baseURL https://api1.example.com/v1,https://api2.example.com/v1
```

#### `set-key [key]`

设置 OpenAI compatible API Key。

```bash
git ai set-key sk-xxxxxxxxxxxxx
```

支持多个 Key，用英文逗号分隔：

```bash
git ai set-key key1,key2,key3
```

#### `set-model [model]`

设置要使用的模型。

```bash
git ai set-model gpt-4
```

支持多个模型，用英文逗号分隔：

```bash
git ai set-model gpt-4,claude-3,gemini-pro
```

如果不提供参数，会交互式选择模型：

```bash
git ai set-model
```

#### `select-model`

从模型列表中交互式选择模型。使用此命令前需要配置环境变量 `OPENAI_MODEL_LIST_URL`。

```bash
git ai select-model
```

**环境变量配置：**

`OPENAI_MODEL_LIST_URL` 用于指定模型列表的来源，支持 HTTP(S) URL 或本地文件路径。

**设置环境变量：**

```bash
# Linux/macOS
export OPENAI_MODEL_LIST_URL="https://raw.githubusercontent.com/xx025/carrot/main/model_list.json"

# Windows (PowerShell)
$env:OPENAI_MODEL_LIST_URL="https://raw.githubusercontent.com/xx025/carrot/main/model_list.json"

# Windows (CMD)
set OPENAI_MODEL_LIST_URL=https://raw.githubusercontent.com/xx025/carrot/main/model_list.json
```

**支持的格式：**

- **HTTP(S) URL**: `https://example.com/model_list.json`
- **本地文件路径（Linux/macOS）**: `/path/to/your/local/model_list.json`
- **本地文件路径（Windows）**: `C:\Path\To\Your\Local\model_list.json`

**JSON 配置格式：**

模型 id、baseURL、key 配置多个会随机取，必填(id、baseURL)、非必填(keys)

```json
{
  "data": [
    {
      "id": "modelId1,modelId2,modelId3",
      "baseURL": "baseURL1,baseURL2,baseURL3",
      "keys": "key1,key2,key3"
    }
  ]
}
```

**示例：**

```bash
# 设置环境变量后执行
export OPENAI_MODEL_LIST_URL="https://raw.githubusercontent.com/xx025/carrot/main/model_list.json"
git ai select-model
```

#### `set-max-token <maxToken>`

设置最大 token 数，默认 128000（128k）。

```bash
git ai set-max-token 128000
```

当代码变更超过最大 token 数时，工具会使用 `git diff --stat` 来获取文件统计信息。

## 🔧 工作流程

执行 `git ai` 时，工具会按以下流程执行：

```
检查环境 → 检查目录 → 检查冲突 → 处理合并
   ↓
git add → 获取 diff → AI 生成 commit message
   ↓
git commit → git fetch → git merge → 检查冲突 → git push
```

## 📝 提交消息格式

工具生成的提交消息符合常见的 commit message 规范：

```
<type>(<username>): <description>

[可选的详细说明]
```

**类型（type）包括：**

- `feat` - 新功能
- `fix` - 修复 bug
- `docs` - 文档变更
- `style` - 代码格式变更（不影响代码运行）
- `refactor` - 重构代码
- `perf` - 性能优化
- `test` - 测试相关
- `build` - 构建系统或外部依赖变更
- `ci` - CI 配置文件和脚本变更
- `chore` - 其他变更（不修改 src 或 test 文件）
- `revert` - 回滚提交

**示例：**

```
feat(John): 添加用户登录功能

- 实现用户名密码登录
- 添加 JWT token 验证
- 完善错误处理机制
```

## 🛠️ 高级功能

### 冲突检测

工具会自动检测：

1. **Git 冲突** - 检测未解决的合并冲突（UU、AA、DD 状态）
2. **代码冲突标记** - 检测代码中的冲突标记（`<<<<<<<`、`=======`、`>>>>>>>`）

如果检测到冲突，工具会提示你手动解决。

### AI 诊断

当 `git commit` 失败时，工具会：

1. 自动收集错误信息、git status 和 hook 输出
2. 使用 AI 分析失败原因
3. 提供诊断结果和修复建议

### 子目录支持

如果在 Git 仓库的子目录中运行，工具会：

- 只处理当前目录下的文件
- 显示警告提示当前操作范围

## ⚙️ 配置存储

配置信息存储在本地，使用 `configstore` 管理。配置文件位置：

- **Linux/macOS**: `~/.config/configstore/git-ai/cli.json`
- **Windows**: `%APPDATA%\configstore\@git-ai\cli.json`

## 🔍 故障排除

### 问题：获取 git 用户信息时出错

**解决方案：**

```bash
git config user.name "Your Name"
```

### 问题：更新内容超过模型支持的最大 token 数

**解决方案：**

1. 减少要提交的文件数量
2. 增加最大 token 数：`git ai set-max-token <更大的值>`

### 问题：AI 生成的内容不符合规则

**解决方案：**

重新运行 `git ai`，AI 会重新生成提交消息。

### 问题：网络错误或 API 调用失败

**解决方案：**

1. 检查网络连接
2. 验证 API Base URL 和 Key 是否正确
3. 检查 API 服务是否可用

## 📋 系统要求

- Node.js >= 12.20.0
- Git >= 2.0.0

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👤 作者

**Baran**

- GitHub: [@code-ba](https://github.com/code-ba)
- Email: info@cxvh.com

## 🔗 相关链接

- [GitHub Repository](https://github.com/code-ba/git-ai)
- [Issue Tracker](https://github.com/code-ba/git-ai/issues)
- [NPM Package](https://www.npmjs.com/package/@git-ai/cli)

---

**注意：** 首次使用建议先使用 `--dry-run` 选项测试，确保一切正常后再正式提交。
