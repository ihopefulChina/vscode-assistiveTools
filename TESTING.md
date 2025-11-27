# 测试指南

## 前置准备

### 1. 安装依赖

```bash
npm install
```

### 2. 编译项目

```bash
npm run compile
```

或者使用监听模式（推荐，会自动重新编译）：

```bash
npm run watch
```

## 测试步骤

### 方法一：使用 VSCode 调试功能（推荐）

1. **打开项目**

   - 在 VSCode 中打开 `vscode-assistiveTools` 项目

2. **启动调试**

   - 按 `F5` 键，或者
   - 点击左侧调试面板（🐛 图标）
   - 选择"运行扩展"配置
   - 点击绿色播放按钮

3. **新窗口打开**

   - 会弹出一个新的 VSCode 窗口（标题栏显示 `[扩展开发主机]`）
   - 这是插件的测试环境

4. **打开测试文件**
   - 在新窗口中打开 `test/test-enum.ts` 文件
   - 或者创建一个新的 `.ts` 文件，输入以下内容：

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

5. **测试悬停功能**

   - 将鼠标悬停在 `enum EStatus` 这一行上
   - 应该会显示一个悬停提示，包含"生成枚举转换"的链接

6. **测试转换功能**
   - 点击"生成枚举转换"链接
   - 应该会在枚举定义下方自动生成：

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

7. **测试重复生成**
   - 再次将鼠标悬停在 `enum EStatus` 上
   - 点击"生成枚举转换"
   - 应该会显示提示："转换代码已存在。如需重新生成，请删除原有代码"

### 方法二：打包安装测试

1. **安装 vsce（VSCode Extension Manager）**

```bash
npm install -g @vscode/vsce
```

2. **打包插件**

```bash
vsce package
```

3. **安装插件**

```bash
code --install-extension vscode-assistive-tools-0.0.1.vsix
```

4. **重启 VSCode 并测试**

## 测试场景

### 场景 1：基本枚举转换

- ✅ 悬停显示链接
- ✅ 点击生成代码
- ✅ 生成的代码格式正确

### 场景 2：枚举名称转换规则

- 测试以 `E` 开头的枚举（如 `EStatus` → `MStatus`, `OStatus`）
- 测试不以 `E` 开头的枚举（如 `Status` → `MStatus`, `OStatus`）

### 场景 3：重复生成保护

- ✅ 已生成代码后，再次点击应提示已存在

### 场景 4：不同文件类型

- ✅ TypeScript (`.ts`)
- ✅ TypeScript React (`.tsx`)
- ✅ JavaScript (`.js`)
- ✅ JavaScript React (`.jsx`)

### 场景 5：枚举注释

- ✅ 有 JSDoc 注释的枚举项
- ✅ 无注释的枚举项（应使用空字符串）

## 调试技巧

1. **查看控制台输出**

   - 在调试窗口中，打开"调试控制台"
   - 可以看到 `console.log` 的输出

2. **断点调试**

   - 在 `src/hover.ts` 或 `src/extension.ts` 中设置断点
   - 重新启动调试（F5）
   - 执行操作时会停在断点处

3. **重新加载扩展**
   - 修改代码后，在调试窗口中按 `Ctrl+R` (Windows/Linux) 或 `Cmd+R` (Mac)
   - 或者停止调试后重新启动
