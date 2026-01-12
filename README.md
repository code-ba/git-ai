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

| 命令                         | 说明              |
| ---------------------------- | ----------------- |
| `git ai`                     | 生成并提交        |
| `git ai -e, --allowEmpty`    | 允许空提交        |
| `git ai -n, --noVerify`      | 跳过 Git hooks    |
| `git ai -s, --skip`          | 跳过 git add      |
| `git ai set-baseURL <url>`   | 设置 API 地址     |
| `git ai set-key <key>`       | 设置 API 密钥     |
| `git ai set-model <model>`   | 设置模型          |
| `git ai set-max-token <num>` | 设置最大 token 数 |

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

## 📋 系统要求

- Node.js >= 12.20.0
- Git >= 2.0.0

## 📄 许可证

MIT License
