# Changelog

## 0.2.0

- 新增项目级 `.assistive-tools/workflow.yml` / YAML / JSON 工作流配置。
- 新增基于 Git 改动范围的验证推荐与顺序执行，生成命令优先于检查命令，结果绑定当前改动签名。
- 新增生成物保护：识别直接编辑、漏运行和过期结果，保存生成物时提供提醒。
- 新增 READY / NOT READY 发布就绪矩阵和 Markdown 报告，覆盖 Git 状态、生成链路、必需检查和发布物。
- 新增独立 Assistive Tools 活动栏入口，集中展示“项目脚本”和“发布工作流”。
- 发布工作流在多根工作区中按根目录分组展示和运行。
- Monorepo 脚本中心支持根 `package.json`，以及 npm / pnpm 声明的单层和多层 workspace。
- Taro 页面/组件创建会识别最近的 Monorepo package，默认使用 kebab-case 目录，并生成 TSX 与 Less Module 两个文件。

## 0.1.0

- 枚举 Map / Options 生成与可重复更新。
- Vue 2、Vue 3、UniApp、Taro 和自定义 YAML 模板中心。
- 根项目与 Monorepo 脚本运行、停止、收藏和最近运行。
- Taro / 微信小程序页面调试配置同步。
