# 测试指南

## 自动化检查

```bash
npm ci
npm test
npm audit --audit-level=high
```

`npm test` 会先编译扩展，再执行以下回归场景：

- 枚举名称转换
- 注释中的伪枚举不会显示操作
- 生成代码紧跟枚举，不会插入下一条语句
- 字符串成员和带单引号注释可以安全生成
- 普通枚举名和相似类型名不会被误判为重复代码
- 枚举生成块可以更新并保留用户修改过的标签
- 命令面板无有效枚举时不会抛异常
- PascalCase、camelCase、kebab-case 转换
- React Vite 项目不会被识别为 Vue
- 多根工作区使用当前目录所属项目
- 自定义模板不能越界或通过符号链接写文件
- YAML 模板支持创建嵌套目录
- 模板中心可以发现多个模板并报告非法输出路径
- Taro Monorepo 使用最近的子包 `package.json` 自动识别，并生成 TSX + Less Module
- 脚本中心始终包含根目录 `package.json` 脚本
- 根目录脚本和 Monorepo 子包脚本可以同时收集
- 多个单层和多层 workspace 模式可以同时发现
- npm/pnpm workspace 配置和 Bun 执行命令解析
- 小程序主包、分包页面解析及既有调试参数保留
- 工作流 YAML/JSON 配置结构和路径校验
- Git glob 命中、排除规则和生成命令优先顺序
- 生成物直接修改、结果过期和发布物缺失的矩阵状态
- 发布就绪报告内容与默认配置生成

## 扩展开发主机验证

1. 在 VSCode 中打开仓库。
2. 按 `F5` 启动“运行扩展”。
3. 按 [快速开始](./QUICK_START.md) 验证五组功能。
4. 额外检查 Vue 2、Vue 3、UniApp、Taro 四种内置模板。
5. 使用 README 中的 YAML 示例验证多文件和嵌套目录输出。
6. 分别在根项目和 workspace 子包中运行一个短时脚本，并验证停止、收藏和最近运行。
7. 使用临时 `project.private.config.json` 验证页面同步，不要覆盖真实调试参数。
8. 修改工作流命中的源文件，确认推荐项按“生成 → 验证”运行，并生成 `NOT READY` / `READY` 报告。
9. 直接保存一个配置为生成物的文件，确认出现保护提示；不运行生成命令时发布矩阵必须阻断。
10. 打开一个包含两个根目录的工作区，确认“发布工作流”分别展示两个根目录，操作不会串用配置或结果。

## 发布包验证

```bash
npx @vscode/vsce package --no-yarn
unzip -l vscode-assistive-tools-*.vsix
```

确认 VSIX 至少包含：

- `extension/out/extension.js`
- `extension/out/commands/enum-hover.js`
- `extension/out/commands/create-components.js`
- `extension/out/commands/wechat-pages.js`
- `extension/out/npm-scripts.js`
- `extension/out/workflow.js`
- `extension/resources/images/assistive-tools.svg`
- `extension/resources/templates/`
- `extension/node_modules/js-yaml/`
- `extension/node_modules/typescript/`

确认包中不包含 `src/`、`test/` 和 `.assistive-tools/`。

编译、自动化测试和打包通过不等于真实 Extension Host 或各框架项目的 UAT 通过。
