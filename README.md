# @git-ai/cli

[![npm version](https://img.shields.io/npm/v/@git-ai/cli.svg?logo=npm)](https://www.npmjs.com/package/@git-ai/cli)
[![npm downloads](https://img.shields.io/npm/dm/@git-ai/cli.svg)](https://www.npmjs.com/package/@git-ai/cli)
[![Build Status](https://img.shields.io/github/actions/workflow/status/code-ba/git-ai/publish.yml?branch=main&logo=github)](https://github.com/code-ba/git-ai/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

基于 AI 的 Git 提交消息生成器，自动分析代码变更并生成规范的 commit message。

## ✨ 特性

- 🤖 **AI 自动生成提交消息**
- 🔄 **完整 Git 工作流** (add/commit/fetch/merge/push)
- 🛡️ **冲突检测** (Git 冲突 + 代码冲突标记)
- 🔍 **AI 诊断** (commit 失败时自动分析)
- ⚙️ **灵活配置** (支持多 API/模型/密钥)
- 🎯 **符合规范** (feat/fix/docs 等格式)

## 📦 安装

```bash
npm install -g @git-ai/cli
```

## 🚀 快速开始

### 1. 配置 API

```bash
git ai set-baseURL https://api.siliconflow.cn/v1
git ai set-key your-api-key
git ai set-model Qwen/Qwen2.5-Coder-7B-Instruct
```

### 2. 生成提交

```bash
git ai
```

工具会自动执行：`git add` → AI 生成消息 → `git commit` → `git fetch` → `git merge` → `git push`

## 📖 常用命令

| 命令 | 说明 |
|------|------|
| `git ai` | 生成并提交 |
| `git ai -d, --dryRun` | 测试模式（不实际提交） |
| `git ai -e, --allowEmpty` | 允许空提交 |
| `git ai -n, --noVerify` | 跳过 Git hooks |
| `git ai -s, --skip` | 跳过 git add |
| `git ai set-baseURL <url>` | 设置 API 地址 |
| `git ai set-key <key>` | 设置 API 密钥 |
| `git ai set-model <model>` | 设置模型 |
| `git ai set-max-token <num>` | 设置最大 token 数 |
| `git ai select-model` | 交互式选择模型 |

## ⚙️ 配置说明

### 多 API/模型支持

```bash
# 多个地址（随机选择）
git ai set-baseURL https://api1.com/v1,https://api2.com/v1

# 多个密钥（随机选择）
git ai set-key key1,key2,key3

# 多个模型（随机选择）
git ai set-model gpt-4,claude-3,gemini-pro
```

### select-model 环境变量

使用 `git ai select-model` 前需设置：

```bash
export OPENAI_MODEL_LIST_URL="https://raw.githubusercontent.com/xx025/carrot/main/model_list.json"
```

JSON 格式：
```json
{
  "data": [{
    "id": "model1,model2",
    "baseURL": "url1,url2",
    "keys": "key1,key2"
  }]
}
```

## 🔧 工作流程

```
检查环境 → git add → AI 生成消息 → git commit → git fetch → git merge → git push
```

## 📝 提交消息格式

```
<type>(<username>): <description>

[详细说明]
```

**类型**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

**示例**:
```sh

```

## 🔍 故障排除

**git 用户信息错误**:
```bash
git config user.name "Your Name"
```

**token 数超限**:
```bash
git ai set-max-token 256000
```

**网络/API 错误**: 检查网络连接、API Key 和 Base URL

## 📋 系统要求

- Node.js >= 12.20.0
- Git >= 2.0.0

## 📄 许可证

MIT License

