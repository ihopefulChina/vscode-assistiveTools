# 发布检查清单

发布前请完成以下检查：

## 📋 必需项

- [ ] **更新版本号**：在 `package.json` 中更新 `version` 字段
- [ ] **设置 Publisher**：在 `package.json` 中设置 `publisher` 字段（不能使用占位符）
- [ ] **代码测试**：所有功能已测试通过
- [ ] **编译成功**：运行 `npm run compile` 无错误

## 📝 推荐项

- [ ] **设置 Repository**：在 `package.json` 中设置 `repository` 字段
- [ ] **更新 README**：确保 README.md 描述准确
- [ ] **更新 CHANGELOG**：记录本次更新的内容（如果有）
- [ ] **检查 .vscodeignore**：确保不需要的文件已排除

## 🚀 发布步骤

### 本地打包测试

```bash
# 1. 安装 vsce（如果还没安装）
npm install -g @vscode/vsce

# 2. 打包
npm run package

# 3. 测试安装
code --install-extension vscode-assistive-tools-0.0.1.vsix
```

### 发布到 Marketplace

```bash
# 1. 登录（首次发布需要）
vsce login your-publisher-id

# 2. 发布
npm run publish
```

## ⚠️ 注意事项

1. **Publisher ID** 必须与 Azure DevOps 中的 Publisher ID 一致
2. **版本号** 必须大于之前的版本
3. **首次发布** 需要创建 Publisher 账号（https://marketplace.visualstudio.com/manage）
4. **Personal Access Token** 需要 Marketplace 的 Manage 权限

## 📚 详细文档

- 完整发布指南：查看 [PUBLISHING.md](./PUBLISHING.md)
