# 东软答题助手

> 浏览器端智能答题工具，支持单选/多选/判断，自动翻页。基于 DeepSeek AI，无需后端。

[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## ✨ 功能

- 🤖 **AI 自动答题** — 连接 DeepSeek API，智能分析题干并选择正确答案
- 📄 **自动翻页** — 检测并点击"下一页"，跨页连续答题
- 🎯 **手动选中模式** — 点击题目空白区域选中，批量答指定题目
- 📦 **多选修复** — 针对 Element Plus 复选框逐项点击 + 验证重试
- 💾 **断点续答** — localStorage 记录已答题目，刷新/翻页不重复
- 🖱 **可拖动面板** — 控制面板任意位置拖动，按钮/日志不受影响
- ⚡ **零依赖** — 纯 JavaScript，Tampermonkey 或 Console 两种方式

## 🚀 快速开始

### 方式一：书签召唤（推荐）

1. 双击 `tools/start.bat` 启动本地 HTTP 服务并打开答题页
2. 浏览器打开 `tools/bookmarklet.html`，将按钮拖到书签栏
3. 进入答题页面后，点书签即可召唤面板

### 方式二：Console 运行

```javascript
var s=document.createElement('script');
s.src='http://localhost:8888/neusoft-mini.js';
document.body.appendChild(s);
```

### 方式三：Tampermonkey 自动注入

安装 `src/neusoft-auto.user.js` 到 Tampermonkey，进入答题页自动弹出。

## ⚙️ 配置

在脚本中修改以下变量：

```javascript
var KEY = 'sk-your-deepseek-api-key';  // DeepSeek API Key
```

> 💡 获取 Key：https://platform.deepseek.com

## 🏗 技术栈

| 层面 | 技术 |
|------|------|
| 目标平台 | Vue 3 + Element Plus SPA |
| AI 引擎 | DeepSeek Chat API (OpenAI 兼容) |
| 部署方式 | Python HTTP Server / Tampermonkey |
| 持久化 | localStorage |

## 📁 项目结构

```
neusoft-auto-answer/
├── src/
│   ├── neusoft-mini.js          # 主脚本（Console/书签加载）
│   └── neusoft-auto.user.js     # Tampermonkey 自动注入版
├── tools/
│   ├── start.bat                # Windows 一键启动器
│   ├── bookmarklet.html         # 书签召唤页面
│   └── neusoft-auto-answer.py   # Python/Playwright 备用方案
├── README.md
└── LICENSE
```

## 🔍 工作原理

1. **DOM 扫描** — 检测 `.el-radio-group` / `.el-checkbox-group` 定位题目
2. **题型判定** — 根据 CSS 类名和选项数量区分单选/多选/判断
3. **题干提取** — 从 `.qusetion-info` 提取题目文本，剔除选项干扰
4. **AI 调用** — 结构化 Prompt 发送到 DeepSeek，要求返回 JSON
5. **答案填写** — 模拟 Element Plus 组件点击，多选有验证重试机制
6. **状态管理** — `localStorage` 存储已答题目 ID，避免重复

## ⚠️ 免责声明

本项目仅供学习交流使用。使用者应遵守所在平台的用户协议，自行承担使用风险。

## 📄 License

MIT
