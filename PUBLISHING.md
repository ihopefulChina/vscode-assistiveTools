# 发布指南

## 发布方式

有两种方式可以发布和使用插件：

1. **本地打包**：生成 `.vsix` 文件，可以本地安装或分享给他人
2. **发布到 Marketplace**：发布到 VSCode 官方市场，所有人都可以搜索和安装

---

## 方式一：本地打包（推荐用于测试和内部使用）

### 步骤 1：安装 vsce

```bash
npm install -g @vscode/vsce
```

### 步骤 2：更新 package.json

确保 `package.json` 中包含以下字段：

- `publisher`：发布者名称（必需）
- `repository`：仓库地址（可选但推荐）
- `license`：许可证（可选但推荐）

### 步骤 3：打包插件

```bash
vsce package
```

这会生成一个 `.vsix` 文件，例如：`vscode-assistive-tools-0.0.1.vsix`

### 步骤 4：安装插件

#### 方法 A：命令行安装

```bash
code --install-extension vscode-assistive-tools-0.0.1.vsix
```

#### 方法 B：VSCode UI 安装

1. 打开 VSCode
2. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac)
3. 输入 `Extensions: Install from VSIX...`
4. 选择生成的 `.vsix` 文件

### 步骤 5：验证安装

1. 重启 VSCode
2. 打开一个 TypeScript 文件
3. 测试枚举悬停转换功能

---

## 方式二：发布到 VSCode Marketplace

### 前置准备

1. **创建 Azure DevOps 账号**

   - 访问：https://dev.azure.com
   - 使用 Microsoft 账号登录（如果没有，需要注册）

2. **创建 Personal Access Token (PAT)**

   - 登录 Azure DevOps
   - 点击右上角用户头像 → **Personal access tokens**
   - 点击 **+ New Token**
   - 设置：
     - **Name**: `VSCode Extension Publishing`
     - **Organization**: `All accessible organizations`
     - **Expiration**: 根据需求设置（建议 1 年）
     - **Scopes**: 勾选 **Custom defined** → 勾选 **Marketplace** → 选择 **Manage**
   - 点击 **Create**
   - **重要**：复制生成的 token（只显示一次！）

3. **创建发布者账号**
   - 访问：https://marketplace.visualstudio.com/manage
   - 使用 Microsoft 账号登录
   - 点击 **Create Publisher**
   - 填写信息：
     - **Publisher ID**: 唯一标识符（例如：`your-name`）
     - **Publisher Name**: 显示名称
     - **Support URL**: 可选
   - 点击 **Create**

### 发布步骤

#### 步骤 1：更新 package.json

确保包含以下字段：

```json
{
  "publisher": "your-publisher-id",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/vscode-assistiveTools.git"
  },
  "license": "MIT",
  "icon": "icon.png" // 可选，128x128 PNG 图标
}
```

#### 步骤 2：登录 vsce

```bash
vsce login your-publisher-id
```

输入之前创建的 Personal Access Token

#### 步骤 3：发布

```bash
vsce publish
```

这会：

1. 自动编译项目（运行 `vscode:prepublish` 脚本）
2. 验证 package.json
3. 打包插件
4. 上传到 Marketplace

#### 步骤 4：等待审核

- 首次发布可能需要几分钟到几小时审核
- 后续更新通常更快
- 可以在 https://marketplace.visualstudio.com/manage 查看状态

#### 步骤 5：验证发布

1. 访问 Marketplace：https://marketplace.visualstudio.com
2. 搜索你的插件名称
3. 应该能看到你的插件

---

## 更新已发布的插件

### 更新版本号

在 `package.json` 中更新 `version` 字段：

```json
{
  "version": "0.0.2" // 从 0.0.1 更新到 0.0.2
}
```

### 发布更新

```bash
vsce publish
```

vsce 会自动检测版本号变化并发布新版本。

---

## 版本号规范

遵循 [语义化版本](https://semver.org/)：

- **主版本号** (1.0.0)：不兼容的 API 修改
- **次版本号** (0.1.0)：向下兼容的功能性新增
- **修订号** (0.0.1)：向下兼容的问题修正

示例：

- `0.0.1` → `0.0.2`：修复 bug
- `0.0.2` → `0.1.0`：新增功能
- `0.1.0` → `1.0.0`：重大更新

---

## 常用命令

```bash
# 打包（不发布）
vsce package

# 打包并指定输出文件名
vsce package -o my-extension.vsix

# 发布（自动打包）
vsce publish

# 发布指定版本
vsce publish 1.0.0

# 发布并跳过版本检查
vsce publish --no-yarn

# 查看帮助
vsce --help
```

---

## 检查清单

发布前请确认：

- [ ] `package.json` 中的 `version` 已更新
- [ ] `package.json` 中包含 `publisher` 字段
- [ ] 代码已测试通过
- [ ] README.md 已更新
- [ ] 所有功能正常工作
- [ ] 没有敏感信息（API keys、密码等）
- [ ] `.vscodeignore` 已正确配置（排除不需要的文件）

---

## 常见问题

### Q: 发布时提示 "Extension name already exists"

A: 插件名称已被占用，需要在 `package.json` 中修改 `name` 字段。

### Q: 发布时提示 "Invalid publisher"

A: 检查 `publisher` 字段是否与 Azure DevOps 中的 Publisher ID 一致。

### Q: 如何撤销已发布的版本？

A: 在 https://marketplace.visualstudio.com/manage 中，可以取消发布或删除版本（但已安装的用户不会自动卸载）。

### Q: 可以发布私有插件吗？

A: 可以，但需要 Visual Studio Enterprise 订阅。大多数情况下，发布到 Marketplace 是公开的。

### Q: 发布后多久可以在 Marketplace 搜索到？

A: 通常几分钟内，但首次发布可能需要更长时间审核。

---

## 参考资源

- [VSCode 扩展发布文档](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [vsce 工具文档](https://github.com/microsoft/vscode-vsce)
- [Marketplace 管理页面](https://marketplace.visualstudio.com/manage)
- [语义化版本规范](https://semver.org/)
