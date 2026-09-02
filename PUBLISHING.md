# 发布指南

Assistive Tools 使用同一个经过验证的 VSIX 发布到 Visual Studio Marketplace、Open VSX 和 GitHub Releases，避免不同平台出现内容不一致的构建产物。

## 1. 发布前检查

```bash
npm ci
npm test
npm audit --audit-level=high
git diff --check
```

同时完成 [TESTING.md](./TESTING.md) 中的扩展开发宿主验收。编译和单元测试通过不等于真实 VS Code 交互已通过。

确认 `package.json` 与 `package-lock.json` 版本一致，并更新：

- [README.md](./README.md)：安装、功能、配置和实例
- [QUICK_START.md](./QUICK_START.md)：本地操作闭环
- [TESTING.md](./TESTING.md)：自动化、UAT 和打包检查
- [CHANGELOG.md](./CHANGELOG.md)：本次版本变化

## 2. 生成唯一发布包

```bash
RELEASE_VERSION=$(node -p "require('./package.json').version")
npx @vscode/vsce package --no-yarn --out "vscode-assistive-tools-${RELEASE_VERSION}.vsix"
unzip -t "vscode-assistive-tools-${RELEASE_VERSION}.vsix"
shasum -a 256 "vscode-assistive-tools-${RELEASE_VERSION}.vsix"
```

检查包内容：

```bash
unzip -l "vscode-assistive-tools-${RELEASE_VERSION}.vsix"
```

至少应包含：

- `extension/out/extension.js`
- `extension/out/workflow.js`
- `extension/out/npm-scripts.js`
- `extension/out/commands/`
- `extension/resources/images/assistive-tools.svg`
- `extension/resources/templates/`
- `extension/readme.md`（VSCE 会标准化文件名大小写）
- `extension/changelog.md`（VSCE 会标准化文件名大小写）

不应包含 `src/`、`test/`、`.assistive-tools/` 或本地编辑器配置。

## 3. 提交和标签

```bash
git add <本次版本文件>
git commit -m "feat: release Assistive Tools ${RELEASE_VERSION}"
git tag -a "v${RELEASE_VERSION}" -m "Assistive Tools ${RELEASE_VERSION}"
git push origin main
git push origin "v${RELEASE_VERSION}"
```

推送前确认工作区只包含本次版本改动，不覆盖其他人的未提交内容。

## 4. Visual Studio Marketplace

首次发布需要在 Azure DevOps 创建具有 Marketplace `Manage` 权限的 Personal Access Token，并创建与 `package.json#publisher` 一致的发布者。

命令行发布：

```bash
npx @vscode/vsce login ihopefulChina
npx @vscode/vsce publish --packagePath "vscode-assistive-tools-${RELEASE_VERSION}.vsix"
```

也可以在 [Marketplace Publisher 管理页](https://marketplace.visualstudio.com/manage) 上传同一个 VSIX。发布后打开扩展详情页，确认版本、README、图标和安装入口。

## 5. Open VSX

使用 [Open VSX 扩展管理页](https://open-vsx.org/user-settings/extensions) 上传同一个 VSIX，或使用已经配置的 token：

```bash
npx ovsx publish "vscode-assistive-tools-${RELEASE_VERSION}.vsix"
```

发布后打开扩展详情页，确认最新版本和 README 已更新。

## 6. GitHub Release

在对应的 `v${RELEASE_VERSION}` 标签上创建 GitHub Release，发布说明取自 CHANGELOG，并上传同一个 VSIX。上传后核对 GitHub 显示的 digest 与本地 SHA-256 一致。

GitHub Packages 不提供 VSIX 对应的原生包类型；扩展二进制使用 GitHub Releases 分发。

## 7. 发布后验证

- Marketplace、Open VSX、GitHub Release 均显示同一个版本号
- 三处 VSIX 的 SHA-256 一致
- Marketplace 与 Open VSX 页面能加载 README 图片
- 从 Marketplace 或 Open VSX 安装后，活动栏出现 Assistive Tools 图标
- “项目脚本”可发现根目录和 Monorepo package 脚本
- “发布工作流”可读取配置、运行推荐验证并生成报告

如平台仍显示旧版本，先等待索引刷新，再重新打开公开详情页验证；不要重新构建另一个同版本 VSIX。
