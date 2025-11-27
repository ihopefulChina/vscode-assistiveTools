# VSCode Assistive Tools

VSCode 辅助工具插件，提供枚举悬停转换等功能。

## 功能

### 枚举悬停转换

当你在 TypeScript/JavaScript 文件中将鼠标悬停在枚举定义上时，会显示"生成枚举转换"的链接。点击后会自动生成：

1. **Map 对象**：将枚举值映射到注释文本
2. **Option 数组**：生成用于下拉选择等场景的选项数组

#### 使用示例

假设你有以下枚举：

```typescript
enum EStatus {
  /** 待处理 */
  Pending = "pending",
  /** 已完成 */
  Completed = "completed",
  /** 已取消 */
  Cancelled = "cancelled",
}
```

将鼠标悬停在 `enum EStatus` 上，点击"生成枚举转换"，会自动生成：

```typescript
export const MStatus = {
  [EStatus.Pending]: "待处理",
  [EStatus.Completed]: "已完成",
  [EStatus.Cancelled]: "已取消",
};

export const OStatus = [
  { value: EStatus.Pending, label: "待处理" },
  { value: EStatus.Completed, label: "已完成" },
  { value: EStatus.Cancelled, label: "已取消" },
];
```

## 开发

### 安装依赖

```bash
npm install
```

### 编译

```bash
npm run compile
```

### 监听模式

```bash
npm run watch
```

### 调试和测试

#### 快速测试步骤

1. **编译项目**（如果还没编译）

   ```bash
   npm run compile
   ```

2. **启动调试**

   - 按 `F5` 键启动调试
   - 会打开一个新的 VSCode 窗口（标题栏显示 `[扩展开发主机]`）

3. **测试功能**

   - 在新窗口中打开 `test/test-enum.ts` 文件
   - 将鼠标悬停在 `enum EStatus` 这一行上
   - 应该会显示"生成枚举转换"的链接
   - 点击链接，会自动生成转换代码

4. **查看详细测试指南**
   - 查看 [TESTING.md](./TESTING.md) 获取完整的测试说明

#### 调试技巧

- 使用 `npm run watch` 可以在修改代码时自动重新编译
- 在调试窗口中按 `Ctrl+R` (Windows/Linux) 或 `Cmd+R` (Mac) 重新加载扩展
- 在代码中设置断点可以调试插件逻辑

## 发布

### 本地打包

1. 安装 vsce：

   ```bash
   npm install -g @vscode/vsce
   ```

2. 更新 `package.json` 中的 `publisher` 字段（必需）

3. 打包插件：

   ```bash
   npm run package
   # 或
   vsce package
   ```

4. 安装生成的 `.vsix` 文件：
   ```bash
   code --install-extension vscode-assistive-tools-0.0.1.vsix
   ```

### 发布到 Marketplace

详细步骤请查看 [PUBLISHING.md](./PUBLISHING.md)

快速步骤：

1. 创建 Azure DevOps 账号和 Personal Access Token
2. 创建 Publisher（https://marketplace.visualstudio.com/manage）
3. 更新 `package.json` 中的 `publisher` 和 `repository` 字段
4. 登录并发布：
   ```bash
   vsce login your-publisher-id
   npm run publish
   # 或
   vsce publish
   ```

## 后续功能

插件架构已准备好，可以方便地添加更多辅助功能。
