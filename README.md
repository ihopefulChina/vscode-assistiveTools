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

### YAPI 接口类型生成

在命令面板中执行 `Assistive: 生成 YAPI 请求/响应 Interface`，插件会读取 YAPI 接口详情并生成请求 query、body 以及响应的 TypeScript interface。

1. 先在 VS Code 设置中填写 `Assistive Tools › Yapi Token`（对应 `_yapi_token`）。
2. 触发命令后输入形如 `https://doc.xxx.com/project/25/interface/api/80173` 的接口地址。
3. 插件会自动在当前编辑器光标位置插入生成的 interface，包含请求参数、请求体以及响应体等，并使用 JSDoc 注释描述字段含义。

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
