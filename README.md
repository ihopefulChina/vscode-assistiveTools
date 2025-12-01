# VSCode Assistive Tools

VSCode 辅助工具插件，提供枚举悬停转换、YAPI 接口类型生成等功能。

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
}

export const OStatus = [
  { value: EStatus.Pending, label: "待处理" },
  { value: EStatus.Completed, label: "已完成" },
  { value: EStatus.Cancelled, label: "已取消" },
]
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
