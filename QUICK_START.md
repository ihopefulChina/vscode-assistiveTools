# 快速开始

## 本地运行

```bash
npm ci
npm test
```

在 VSCode 中按 `F5`，启动“运行扩展”配置。

## 1. 生成并更新枚举

在扩展开发主机中创建 TypeScript 文件：

```typescript
enum EStatus {
  /** 待处理 */
  Pending = "pending",
  /** 已完成 */
  Completed = "completed",
}
```

将鼠标悬停在 `EStatus` 上并点击“生成或更新枚举转换”；也可以使用灯泡或命令面板中的“转换枚举”。生成后增加一个枚举成员，再执行一次，确认原有自定义标签得到保留。

## 2. 使用模板中心

1. 在资源管理器中右键一个文件夹。
2. 选择“创建组件”。
3. 选择 Vue 3 模板。
4. 输入 `MyUserCard`。
5. 在文件预览中点击“创建”。

从命令面板执行“模板：导出内置模板”，可以把选定框架的模板导出到 `.templates`；修改后执行“模板：校验工作区模板”。

## 3. 运行根目录和 Monorepo 脚本

在测试工作区根 `package.json` 中准备脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "test": "vitest"
  },
  "workspaces": ["packages/*"]
}
```

打开资源管理器中的 `Assistive Scripts`：

1. 确认根项目显示为“(根目录)”并排在最前。
2. 确认 `packages/*` 子包继续显示在下面。
3. 点击脚本运行，通过停止按钮终止。
4. 验证收藏、仅显示收藏和最近运行。

## 4. 同步小程序页面

在 `app.config.ts` 中准备字面量 `pages` 或 `subPackages.pages`，右键文件并执行“微信小程序：同步页面调试配置”。确认预览后，最近的小程序项目根目录会创建或更新 `project.private.config.json`。

完整模板和配置示例见 [README](./README.md)。
