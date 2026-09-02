# 快速开始

## 本地运行

```bash
npm ci
npm test
```

在 VSCode 中按 `F5`，启动“运行扩展”配置。

## 验证枚举转换

在扩展开发主机中创建 TypeScript 文件：

```typescript
enum EStatus {
  /** 待处理 */
  Pending = "pending",
  /** 已完成 */
  Completed = "completed",
}
```

将鼠标悬停在 `EStatus` 上并点击“生成枚举转换”；也可以把光标放在 `EStatus` 上，从命令面板执行“转换枚举”。

## 验证组件创建

1. 在资源管理器中右键一个文件夹。
2. 选择“创建组件”。
3. 选择 Vue 3 模板。
4. 输入 `MyUserCard`。
5. 确认生成 `MyUserCard/index.vue`，其中类名为 `my-user-card`。

自定义模板和完整输出示例见 [README](./README.md)。
