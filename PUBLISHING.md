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
     - **Organization**: **必须选择** `All accessible organizations`（不要选择特定组织）
     - **Expiration**: 根据需求设置（建议 1 年）
     - **Scopes**:
       1. 勾选 **Custom defined**
       2. 在列表中展开 **Marketplace**
       3. **必须勾选** `Manage` 权限（这是发布扩展所必需的）
   - 点击 **Create**
   - **重要**：立即复制生成的 token（只显示一次！如果丢失需要重新创建）

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
- [ ] `package.json` 中包含 `homepage` 字段（指向仓库主页）
- [ ] `package.json` 中包含 `bugs` 字段（指向问题反馈页面）
- [ ] `package.json` 中的 `description` 字段详细且清晰（至少 50 个字符）
- [ ] `package.json` 中的 `repository` URL 是公开可访问的
- [ ] 图标文件存在且格式正确（推荐 128x128 PNG）
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

### Q: 发布时提示 "The Personal Access Token verification has failed" 或 "TF400813"

A: 这表示 Personal Access Token (PAT) 验证失败。请按以下步骤解决：

1. **检查 PAT 是否过期**

   - 访问：https://dev.azure.com
   - 点击右上角用户头像 → **Personal access tokens**
   - 检查你的 PAT 是否已过期
   - 如果已过期，需要创建新的 PAT

2. **重新创建 PAT**（推荐）

   - 登录 Azure DevOps
   - 点击右上角用户头像 → **Personal access tokens**
   - 点击 **+ New Token**
   - 设置：
     - **Name**: `VSCode Extension Publishing`
     - **Organization**: `All accessible organizations`（重要！）
     - **Expiration**: 根据需求设置（建议 1 年）
     - **Scopes**: 勾选 **Custom defined** → 勾选 **Marketplace** → 选择 **Manage**（必须选择 Manage 权限）
   - 点击 **Create**
   - **重要**：立即复制生成的 token（只显示一次！）

3. **重新登录 vsce**

   ```bash
   # 先登出（如果需要）
   vsce logout

   # 使用新的 PAT 登录
   vsce login ihopefulChina
   ```

   输入新创建的 Personal Access Token

4. **验证 Publisher ID**

   - 确保 `package.json` 中的 `publisher` 字段与你在 https://marketplace.visualstudio.com/manage 中创建的 Publisher ID 完全一致
   - 确保登录 vsce 时使用的 publisher ID 与 `package.json` 中的一致

5. **如果问题仍然存在**
   - 确认 PAT 的权限范围包含 **Marketplace** → **Manage**
   - 确认 PAT 的 Organization 设置为 **All accessible organizations**
   - 尝试在浏览器中访问 https://marketplace.visualstudio.com/manage 确认账号正常
   - 如果使用组织账号，确保你有足够的权限

### Q: 发布时提示 "Your extension has suspicious content"

A: 这通常是因为缺少必要的元数据字段或代码中包含可疑内容。请按以下步骤检查：

#### 1. 确保 `package.json` 中包含以下必需字段：

- `homepage`: 指向仓库主页的 URL（例如：`"https://github.com/username/repo#readme"`）
- `bugs`: 包含 `url` 字段，指向问题反馈页面（例如：`{"url": "https://github.com/username/repo/issues"}`）
- `description`: **使用英文描述**，提供详细、清晰的扩展描述（至少 50 个字符，推荐 100+ 字符）
- `repository`: 确保仓库 URL 是公开可访问的
- `icon`: 确保图标文件存在且为有效的 PNG 格式（推荐 128x128 像素）
- `galleryBanner`: 可选但推荐，添加横幅配置（例如：`{"color": "#007ACC", "theme": "dark"}`）

#### 2. 检查代码中是否有可疑内容：

- **移除所有硬编码的内部 URL**：检查代码中是否有硬编码的公司内部 URL、IP 地址或特定域名
  - 例如：`https://doc.company.com` → 改为 `https://yapi.example.com`
- **移除硬编码的敏感信息**：确保没有硬编码的 API keys、tokens、密码等
- **使用通用示例**：所有示例 URL 应使用通用域名（如 `example.com`）

#### 3. 改进描述和元数据：

- **使用英文描述**：Marketplace 更偏好英文描述，即使扩展主要面向中文用户
- **添加更多分类**：在 `categories` 中添加相关分类（如 `"Snippets"`, `"Formatters"` 等）
- **确保描述详细**：描述应清楚说明扩展的功能和用途

#### 4. 验证仓库可访问性：

- 确保 GitHub 仓库是**公开的**
- 确保仓库 URL 可以正常访问
- 确保 README.md 文件存在且内容完整

#### 5. 如果问题仍然存在：

1. 检查 Marketplace 管理页面是否有更详细的错误信息
2. 联系 VS Code Marketplace 支持团队：https://marketplace.visualstudio.com/manage
3. 检查扩展是否包含网络请求功能，确保实现方式符合 Marketplace 规范

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
