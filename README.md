# git-ai

[![npm version](https://img.shields.io/npm/v/@git-ai/core.svg?style=flat&logo=npm)](https://www.npmjs.com/package/@git-ai/core)
[![npm downloads](https://img.shields.io/npm/dm/@git-ai/core.svg?style=flat&logo=npm)](https://www.npmjs.com/package/@git-ai/core)
[![Build Status](https://img.shields.io/github/actions/workflow/status/code-ba/git-ai/publish.yml?style=flat&branch=main&logo=github)](https://github.com/code-ba/git-ai/actions)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat&logo=opensourceinitiative)](https://opensource.org/licenses/Apache-2.0)

基于 AI 的 Git 工具集（lerna monorepo）：自动分析代码变更生成规范的 commit message，并提供 GPG 密钥管理与仓库清理工具。

## 📦 包结构

| 包                                  | 命令        | 说明                                              |
| ----------------------------------- | ----------- | ------------------------------------------------- |
| [`@git-ai/core`](packages/core)     | `git ai`    | 提交命令本体 + `--init`，只保留 `git ai [option]` |
| [`@git-ai/clean`](packages/clean)   | `git clear` | 清理被 `.gitignore` 忽略却已提交的文件            |
| [`@git-ai/gpg`](packages/gpg)       | `git gpg`   | GPG 密钥管理                                      |
| [`@git-ai/shared`](packages/shared) | —           | 各包共用：日志、存储、Git 服务、签名密钥工具      |

`core` / `clean` / `gpg` 可单独安装使用。另有统一入口 [`git-agents-cli`](https://github.com/code-ba/git-agents-cli)：零依赖安装，运行时按需拉取上述包。

## 🚀 安装

```bash
npm install -g git-agents-cli
```

## 🛠️ 开发

环境要求：Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`（lerna 9 的要求；各包运行时支持 Node.js >= 12.20.0）。

```bash
npm install # 安装依赖并链接 workspaces
npm run build # lerna run build，按依赖顺序编译 .mts -> .mjs
npm run lint # eslint
npm run format # prettier --check
```

目录结构：

```
git-ai/
├── packages/
│   ├── shared/ # @git-ai/shared
│   ├── core/ # @git-ai/core
│   ├── clean/ # @git-ai/clean
│   └── gpg/ # @git-ai/gpg
├── scripts/bump-version.mjs # 提交时自动递增已发布版本的 patch 号
├── lerna.json
└── tsconfig.base.json
```

## 📤 发布

推送到 `main` 后由 GitHub Actions 自动执行 `lerna publish from-package`，需在仓库 Secrets 中配置 `NPM_TOKEN`。版本号由 pre-commit 钩子维护：当前版本已在线上时自动 patch +1。

## 📄 License

Apache-2.0
