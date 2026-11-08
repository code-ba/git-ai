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
- 🔑 **GPG 签名管理** (创建/导出/删除密钥、设置默认签名密钥、自动签名)
- 🔍 **AI 诊断** (commit 失败时自动分析)
- ⚙️ **灵活配置** (支持多 API/模型/密钥)
- 🎯 **符合规范** (feat/fix/docs 等格式)

## 📦 安装

```bash
npm install -g @git-ai/cli
```

## 🚀 快速开始

### 1. 初始化配置

```bash
git ai init
```

按提示依次完成配置：

1. **请求类型**：`chat`（OpenAI 兼容，默认）/ `responses`（OpenAI Responses）/ `anthropic`（Anthropic Claude）
2. **baseURL**：API 地址，如 `https://api.siliconflow.cn/v1`
3. **key**：API 密钥（回显时自动掩码）
4. **model**：从接口拉取模型列表多选（拉取失败时降级为手动输入）
5. **max-token**：最大 token 数

已配置的项会回显在输入位置上方，直接回车保持当前值；未配置的项必填。

### 2. 生成提交

```bash
git ai
```

工具会自动执行：`git add` → AI 生成消息 → `git commit` → `git fetch` → `git merge` → `git push`

## 📖 常用命令

| 命令                      | 说明                                 |
| ------------------------- | ------------------------------------ |
| `git ai`                  | 生成并提交                           |
| `git ai -e, --allowEmpty` | 允许空提交                           |
| `git ai -n, --noVerify`   | 跳过 Git hooks                       |
| `git ai --noAdd`          | 跳过 git add                         |
| `git ai -s, --sign`       | GPG 签名提交                         |
| `git ai --noSign`         | 跳过 GPG 签名提交                    |
| `git ai gpg`              | GPG 密钥管理                         |
| `git ai clean`            | 清理被 .gitignore 忽略却已提交的文件 |
| `git ai init`             | 交互式初始化/更新配置                |

## 🔑 GPG 签名管理

```bash
git ai gpg --create         # 交互式创建 GPG 密钥并导出公钥、设为默认签名密钥
git ai gpg --list           # 查看本机 GPG 密钥列表
git ai gpg --export         # 选择密钥导出公钥或私钥
git ai gpg --delete         # 选择密钥删除（公钥+私钥）
git ai gpg --default        # 设置默认签名密钥
git ai gpg --local-default  # 为当前项目指定签名密钥
git ai gpg --auto-sign true # 开启脚手架自动签名（等同于 git commit -S），false 关闭
```

临时跳过签名提交：`git ai --noSign`（等同于 `git commit --no-gpg-sign`）。

## 🧹 清理被忽略却已提交的文件

```bash
git ai clean
```

扫描已跟踪但命中 `.gitignore` 规则的文件：

- 按一级目录聚合展示命中文件及数量；没有命中时提示「未检测到 .gitignore 有问题的文件」并结束
- 询问「是否修复（从 git 索引移除，本地文件保留）？」，默认 Yes；取消则不处理
- 确认后分批执行 `git rm --cached`，从索引移除，本地文件保留
- 完成提示「已清理 N 个文件，本地文件已保留」

## ⚙️ 配置说明

### 多 API/模型支持

`git ai init` 时按以下方式配置多项（随机选择）：

```bash
# baseURL 输入多个地址，英文逗号隔开
https://api1.com/v1,https://api2.com/v1

# key 输入多个密钥，英文逗号隔开
key1,key2,key3

# model 在接口列表中勾选多个
```

## 🔧 工作流程

```
检查环境 → git add → AI 生成消息 → git commit → git fetch → git merge → git push
```

## 📝 提交消息格式

```
<type>(<scope>): <subject>

[详细说明]
```

**类型**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

**scope**: 由 AI 根据变更内容自动生成（模块名、文件名或功能域）

**示例**:

```sh
$ git ai
git-ai verb @git-ai/cli@2.0.3
git-ai verb 按 Ctrl+C 退出...
git-ai success AI 生成的内容：
docs(readme): 更新文档和代码格式规范

- 添加了 GPG 签名管理的文档说明
- 统一了代码中的引号使用为双引号
- 修复了 package.json 中缺少的 access 字段
- 规范化了代码缩进和格式
git-ai info 本次模型消耗统计：总数 17050 tokens、输入 16977 tokens、输出 73 tokens
git-ai success git commit 提交成功...
git-ai info 正在获取远程仓库地址...
git-ai success 获取 git 远程仓库地址成功
git-ai info 获取远程仓库最新状态，执行 git fetch...
git-ai success 远程分支 origin 的最新更改状态获取成功
git-ai success 本地代码是最新，无需合并
git-ai info 正在推送本地分支与远程分支的差异...
git-ai success 本地分支与远程分支的差异已推送。
git-ai verb 本次执行指令耗时: 14.481 秒，程序退出...
```

## 📋 系统要求

- Node.js >= 12.20.0
- Git >= 2.0.0

## 📄 许可证

MIT License
