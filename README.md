# ChatLink

> 统一管理多个 AI 服务提供商，提供 OpenAI 兼容 API 接口

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.2.0-brightgreen)](package.json)

ChatLink 是一个基于 Electron 的桌面应用程序，提供**统一的 AI API 聚合代理**功能。它将多个 AI 服务提供商（智谱 GLM、Kimi、通义千问、MiniMax、Mimo、豆包、Perplexity、Z.ai 等）聚合为一个 OpenAI 兼容的 API 端点，支持多账号负载均衡、模型映射、OAuth 登录、请求日志与统计。

---

## ✨ 核心功能

| 功能 | 描述 |
|------|------|
| 🔄 **OpenAI 兼容代理** | 提供标准 `/v1/chat/completions`、`/v1/models` 等 API 端点，无缝替换 OpenAI SDK |
| 🌐 **多平台 AI 聚合** | 内置支持 10 个 AI 平台，支持自定义 OpenAI 兼容提供商扩展 |
| 🔐 **OAuth / Token 登录** | 支持浏览器 OAuth 登录和内置 WebView 登录获取各平台凭据 |
| 👥 **多账号管理** | 每个提供商可配置多个账号，支持日配额限制 |
| ⚖️ **负载均衡** | 3 种策略：轮询（RR）、填充优先（FF）、故障转移（FO） |
| 🗺️ **模型映射** | 请求模型名到实际模型名的灵活映射，支持全局和每提供商配置 |
| 📡 **流式/非流式** | 完整支持 SSE 流式响应和非流式调用 |
| 💬 **内置聊天界面** | 应用内自带聊天测试页面，模型列表自动同步本地代理 API |
| 📊 **请求日志** | 完整记录请求/响应日志，含延迟、模型、账号等详细信息 |
| 📈 **请求统计** | 代理状态页展示总请求数、成功率、失败数、平均延迟等统计指标 |
| 🛠️ **管理 API** | 提供管理接口，支持远程管理提供商、账号、模型映射、会话等 |
| 📋 **系统托盘** | 最小化到托盘，托盘内快捷操作窗口 |
| 🔄 **自动更新** | 基于 GitHub Releases 的自动更新（electron-updater） |
| 🌓 **暗色模式** | 支持亮色/暗色/跟随系统三种主题 |
| 🔧 **Tool Calling** | 支持 function calling，含 prompt-based 和 Anthropic 格式转换 |
| 💾 **会话管理** | 会话超时、消息数限制、过期自动清理、上下文管理策略 |
| 📐 **侧边栏折叠** | 侧边栏默认折叠，设置页可配置展开/折叠行为 |

---

## 🏗️ 技术栈

| 层级 | 使用技术 |
|------|----------|
| 🖥️ **桌面框架** | Electron 33 |
| ⚛️ **前端** | React 18 + TypeScript + Vite |
| 🎨 **样式** | TailwindCSS 3 + Radix UI + Lucide React |
| 🗄️ **状态管理** | Zustand 5 |
| 🌐 **后端/代理** | Koa 2 + @koa/router |
| 📦 **持久存储** | electron-store + safeStorage (凭证加密存储) |
| 🔄 **自动更新** | electron-updater |
| 🔨 **构建工具** | electron-vite + electron-builder |

---

## 🤖 支持的 AI 平台

| 平台 | 标识 | 支持 OAuth 登录 |
|------|------|:---:|
| 智谱 GLM | `glm` | ✅ |
| 月之暗面 Kimi | `kimi` | ✅ |
| MiniMax | `minimax` | ✅ |
| Mimo | `mimo` | ✅ |
| 豆包 (Doubao) | `doubao` | ✅ |
| Perplexity | `perplexity` | ✅ |
| 通义千问 (Qwen) | `qwen` | ✅ |
| 通义千问 AI | `qwen-ai` | ✅ |
| Z.ai | `zai` | ✅ |
| 自定义 OpenAI 兼容 | `custom` | ⚠️ (Token / Cookie / JWT 等) |

---

## 🏛️ 架构概览

```
┌──────────────────────────────────────────────────────────┐
│                      ChatLink 应用                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌───────────────────┐     IPC (contextBridge)           │
│  │   Main Process    │◄───────────────────────────┐      │
│  │                   │                            │      │
│  │ ┌───────────────┐ │                     ┌──────┴────┐ │
│  │ │ ProxyServer   │ │                     │ Renderer  │ │
│  │ │ (Koa HTTP)    │ │                     │ (React)   │ │
│  │ │ 可配置端口    │ │                     │           │ │
│  │ │ /v1/chat/*    │ │                     │ · 代理设置│ │
│  │ │ /v1/models    │ │  ┌───────────────┐  │ · 聊天    │ │
│  │ │ /v0/management│ │  │  Preload API  │  │ · 供应商  │ │
│  │ └──────┬────────┘ │  └───────────────┘  │ · 模型    │ │
│  │        │          │                     │ · 日志    │ │
│  │ ┌──────▼────────┐ │                     │ · 设置    │ │
│  │ │ LoadBalancer  │ │                     └───────────┘ │
│  │ │ · RR/FF/FO    │ │                                   │
│  │ │ · ModelMapper │ │                                   │
│  │ └──────┬────────┘ │                                   │
│  │        │          │                                   │
│  │ ┌──────▼────────┐ │     ┌──────────────────────┐     │
│  │ │ Forwarder     │ │     │  External AI APIs    │     │
│  │ │ + Adapters ───┼─┼────►│  open.bigmodel.cn    │     │
│  │ │               │ │     │  kimi.moonshot.cn    │     │
│  │ │ GLM           │ │     │  api.minimax.chat    │     │
│  │ │ Kimi          │ │     │  ...                 │     │
│  │ │ Qwen          │ │     └──────────────────────┘     │
│  │ │ Zai           │ │                                   │
│  │ │ Doubao        │ │                                   │
│  │ └───────────────┘ │                                   │
│  └───────────────────┘                                   │
└──────────────────────────────────────────────────────────┘
```

### 请求流程

1. 外部客户端发送 OpenAI 格式请求 → **ProxyServer** (Koa, 默认端口 8080，可自定义)
2. 请求路由到 `POST /v1/chat/completions`
3. **ModelMapper** 解析模型映射
4. **LoadBalancer** 根据策略选择账号/提供商
5. **RequestForwarder** 调用对应 **Adapter** 进行格式转换
6. Adapter 转发到实际 AI API
7. 响应转回 OpenAI 兼容格式返回给客户端
8. 全程记录请求日志和统计数据

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 18
- **npm** >= 9

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/RC16348/ChatLink.git
cd ChatLink

# 安装依赖
npm install

# 开发模式运行（Windows）
npm run dev:win

# 开发模式运行（Linux / macOS）
npm run dev
```

### 构建安装包

```bash
# 构建 Windows x64 安装包（NSIS + Portable）
npm run build:win

# 构建 macOS DMG
npm run build:mac          # Intel x64
npm run build:mac-arm      # Apple Silicon

# 构建 Linux 安装包（AppImage + deb + tar.gz）
npm run build:linux

# 构建全平台
npm run build:all

# 仅编译不打包（解压版在 dist/win-unpacked/）
npm run build:unpack
```

构建产物输出到 `dist/` 目录，包含安装版、便携版和解压版。

---

## 📖 使用说明

### 1. 启动代理

打开 ChatLink 应用，进入**代理设置**页面，配置端口号后点击 **启动代理** 按钮。默认 HTTP 服务端口为 **8080**（可自定义如 8081）。

### 2. 添加提供商账号

进入**供应商**页面：
- 点击「添加供应商」
- 选择 AI 提供商
- 通过 OAuth 登录或手动填入 Token
- 保存账号配置

### 3. 配置模型映射

进入**模型管理**页面：
- 查看已自动加载的模型列表
- 添加自定义模型映射
- 配置每个提供商的模型别名
- 查看自动生成的 API 调用示例代码

### 4. 调用 API

代理启动后，可使用任何 OpenAI 兼容客户端进行调用：

```bash
# 获取模型列表
curl http://localhost:8080/v1/models

# 流式聊天
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-5",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

### 5. 内置聊天测试

进入**聊天**页面，可直接进行对话测试，模型列表自动从本地代理 API 同步。

### 6. 查看日志和统计

- **日志**页面：查看所有 API 请求的详细日志（延迟、模型、账号等）
- **代理状态**页面：查看总请求数、成功率、失败数、平均延迟等统计指标

---

## 📡 API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/models` | GET | 获取可用模型列表 |
| `/v1/models/:model` | GET | 获取单个模型详情 |
| `/v1/chat/completions` | POST | 聊天补全（支持流式/非流式） |
| `/v1/completions` | POST | 文本补全 |
| `/v1/messages` | POST | Anthropic Messages API 兼容 |
| `/health` | GET | 健康检查 |
| `/stats` | GET | 代理运行统计 |
| `/v0/management/*` | GET/POST/PUT/DELETE | 管理 API（需管理密钥，含提供商、账号、模型映射、会话管理、代理控制等） |

---

## 🛠️ 开发

### 目录结构

```
src/
├── main/               # Electron 主进程
│   ├── index.ts        # 应用入口
│   ├── proxy/          # 代理服务器（Koa）
│   │   ├── server.ts   # HTTP 服务
│   │   ├── routes/     # API 路由
│   │   ├── adapters/   # 各平台请求适配器
│   │   └── loadbalancer.ts  # 负载均衡器
│   ├── providers/      # 提供商管理
│   │   └── builtin/    # 内置平台定义
│   ├── oauth/          # OAuth 登录管理
│   │   └── adapters/   # 各平台 OAuth 适配器
│   ├── store/          # 数据持久化
│   ├── tray/           # 系统托盘
│   └── updater/        # 自动更新
├── preload/            # Preload 脚本
├── renderer/           # React 渲染进程
│   └── src/
│       ├── pages/      # 页面组件
│       ├── components/ # UI 组件
│       ├── stores/     # Zustand 状态管理
│       └── i18n/       # 国际化（中文）
└── shared/             # 共享类型和工具
```

### 开发命令

```bash
npm run dev:win    # Windows 开发模式
npm run dev        # Linux/macOS 开发模式
npm run build      # 编译项目
npm run build:win  # 编译并打包 Windows exe
npm run preview    # 预览编译结果
```

---

## 📄 许可证

本项目基于 [GPL-3.0](LICENSE) 许可证开源。

---