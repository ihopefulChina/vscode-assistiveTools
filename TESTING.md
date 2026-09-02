# 测试指南

## 自动化检查

```bash
npm ci
npm test
npm audit --omit=dev
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
- 脚本中心始终包含根目录 `package.json` 脚本
- 根目录脚本和 Monorepo 子包脚本可以同时收集
- npm/pnpm workspace 配置和 Bun 执行命令解析
- 小程序主包、分包页面解析及既有调试参数保留

## 扩展开发主机验证

1. 在 VSCode 中打开仓库。
2. 按 `F5` 启动“运行扩展”。
3. 按 [快速开始](./QUICK_START.md) 验证四组功能。
4. 额外检查 Vue 2、Vue 3、UniApp、Taro 四种内置模板。
5. 使用 README 中的 YAML 示例验证多文件和嵌套目录输出。
6. 分别在根项目和 workspace 子包中运行一个短时脚本，并验证停止、收藏和最近运行。
7. 使用临时 `project.private.config.json` 验证页面同步，不要覆盖真实调试参数。

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
- `extension/resources/templates/`
- `extension/node_modules/js-yaml/`
- `extension/node_modules/typescript/`

编译、自动化测试和打包通过不等于真实 Extension Host 或各框架项目的 UAT 通过。
