# 快速开始测试

## ✅ 准备工作已完成

项目已经编译成功，可以直接开始测试！

## 🚀 立即测试（3 步）

### 步骤 1：启动调试

在 VSCode 中按 **`F5`** 键

### 步骤 2：打开测试文件

在新打开的窗口中，打开 `test/test-enum.ts`

### 步骤 3：测试功能

1. 将鼠标悬停在第 10 行的 `enum EStatus` 上
2. 应该会看到"生成枚举转换"的链接
3. 点击链接
4. 代码会自动生成在枚举下方

## 📋 预期结果

点击后应该生成：

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

## 🔧 如果遇到问题

1. **悬停不显示**

   - 确保光标在 `enum` 关键字所在的行
   - 确保文件是 `.ts`、`.tsx`、`.js` 或 `.jsx` 格式

2. **点击无反应**

   - 查看调试控制台是否有错误
   - 尝试重新加载扩展（在调试窗口按 `Ctrl+R` 或 `Cmd+R`）

3. **代码生成位置不对**
   - 检查枚举定义是否完整
   - 检查是否有语法错误

## 📚 更多信息

- 详细测试指南：查看 [TESTING.md](./TESTING.md)
- 项目说明：查看 [README.md](./README.md)
