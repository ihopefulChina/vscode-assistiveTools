# Assistive Tools

面向日常前端开发的 VSCode 辅助工具。它可以从 TypeScript 枚举生成 Map 和 Options，也可以按照 Vue、UniApp、Taro 或项目自定义模板快速创建组件和页面。

[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=ihopefulChina.vscode-assistive-tools) · [Open VSX](https://open-vsx.org/extension/ihopefulChina/vscode-assistive-tools) · [问题反馈](https://github.com/ihopefulChina/vscode-assistiveTools/issues)

## 功能

- 从枚举及其 JSDoc 注释生成 Map、Options
- 支持悬停操作和命令面板操作
- 创建 Vue 2、Vue 3、UniApp、Taro 组件或页面
- 根据当前工作区自动推荐模板
- 使用 YAML 自定义多文件模板
- 在多根工作区中按当前右键目录选择项目配置

## 枚举转换

### 操作方式一：悬停生成

1. 打开 `.ts` 或 `.tsx` 文件。
2. 将鼠标移到枚举名称上，例如 `EStatus`。
3. 点击悬停卡片中的“生成枚举转换”。
4. Map 和 Options 会紧跟在枚举后生成。

### 操作方式二：命令面板生成

1. 将光标放在枚举名称上。
2. 按 `Cmd+Shift+P`（macOS）或 `Ctrl+Shift+P`（Windows/Linux）。
3. 输入并选择“转换枚举”。

### 完整示例

转换前：

```typescript
enum EStatus {
  /** 待处理 */
  Pending = "pending",
  /** User's choice */
  "in-progress" = "in-progress",
  /** 已完成 */
  Completed = "completed",
}

const nextConfig = {
  enabled: true,
}
```

执行后：

```typescript
enum EStatus {
  /** 待处理 */
  Pending = "pending",
  /** User's choice */
  "in-progress" = "in-progress",
  /** 已完成 */
  Completed = "completed",
}

export const MStatus = {
  [EStatus.Pending]: "待处理",
  [EStatus["in-progress"]]: "User's choice",
  [EStatus.Completed]: "已完成",
}

export const OStatus = [
  { value: EStatus.Pending, label: "待处理" },
  { value: EStatus["in-progress"], label: "User's choice" },
  { value: EStatus.Completed, label: "已完成" },
]

const nextConfig = {
  enabled: true,
}
```

生成名称遵循以下规则：

| 枚举名称     | Map          | Options      |
| ------------ | ------------ | ------------ |
| `EStatus`    | `MStatus`    | `OStatus`    |
| `Status`     | `MStatus`    | `OStatus`    |
| `EOrderType` | `MOrderType` | `OOrderType` |

如果当前作用域已经存在同名 Map 或 Options，插件会提示名称冲突，不会重复写入。

## 创建组件或页面

### 操作步骤

1. 在资源管理器中右键目标文件夹，也可以右键文件并使用它所在的目录。
2. 选择“创建组件”或“创建页面”。
3. 选择模板；自动识别到的模板会显示在第一项。
4. 输入名称，例如 `MyUserCard`。
5. 插件创建 `MyUserCard/` 文件夹并打开第一个生成文件。

例如，在 Vue 3 项目中创建组件 `MyUserCard`：

```text
src/components/
└── MyUserCard/
    └── index.vue
```

生成的 `index.vue`：

```vue
<template>
  <div class="my-user-card">
    <!-- MyUserCard 组件 -->
  </div>
</template>

<script setup lang="ts">
// MyUserCard 组件
</script>

<style lang="scss" scoped>
.my-user-card {
  // 组件样式
}
</style>
```

### 内置模板

| 项目类型 | 识别依据                                       | 输出文件    |
| -------- | ---------------------------------------------- | ----------- |
| Vue 2    | `vue@2` 或 `@vue/composition-api`              | `index.vue` |
| Vue 3    | `vue@3` 或 `@vitejs/plugin-vue`                | `index.vue` |
| UniApp   | `@dcloudio/*`、`manifest.json` 或 `pages.json` | `index.vue` |
| Taro     | `@tarojs/taro` 或 `@tarojs/cli`                | `index.tsx` |

普通 React/Svelte Vite 项目不会被误判为 Vue。多根工作区会使用当前右键目录所属项目的 `package.json` 和 `.templates`。

## 自定义模板

只有在模板选择器中明确选择“自定义模板”时，插件才会读取当前项目根目录的 `.templates`。内置模板不会被 `.templates` 静默覆盖。

支持的文件名：

- 组件：`.templates/vue-component.yml`、`.templates/component.yml` 或 `.templates/component.template`
- 页面：`.templates/vue-page.yml`、`.templates/page.yml` 或 `.templates/page.template`

### YAML 多文件模板示例

创建 `.templates/component.yml`：

```yaml
name: "vue-component"
description: "Vue 组件、样式和类型"
tags: ["vue3", "typescript"]
tpl:
  index.vue: |
    <template>
      <div class="${kebabName}">${pascalName}</div>
    </template>

    <script setup lang="ts">
    import type { ${pascalName}Props } from "./types"

    defineProps<${pascalName}Props>()
    </script>

    <style scoped src="./styles/index.scss"></style>
  types.ts: |
    export interface ${pascalName}Props {
      title?: string
    }
  styles/index.scss: |
    .${kebabName} {
      display: block;
    }
```

右键创建 `MyUserCard` 后得到：

```text
MyUserCard/
├── index.vue
├── types.ts
└── styles/
    └── index.scss
```

YAML 中的输出路径必须位于新建的组件/页面文件夹内。`../` 越界路径、绝对路径和指向外部目录的符号链接会被拒绝。

### 模板变量

两种写法都受支持：`${variable}` 和 `[:=Variable:]`。

以输入 `MyUserCard` 为例：

| 变量                                | 结果                  |
| ----------------------------------- | --------------------- |
| `${name}` / `[:=Name:]`             | `MyUserCard`          |
| `${pascalName}` / `[:=PascalName:]` | `MyUserCard`          |
| `${camelName}` / `[:=CamelName:]`   | `myUserCard`          |
| `${kebabName}` / `[:=KebabName:]`   | `my-user-card`        |
| `${type}` / `[:=Type:]`             | `component` 或 `page` |
| `${date}` / `[:=Date:]`             | 当前日期              |
| `${time}` / `[:=Time:]`             | 当前时间              |

旧格式 `.template` 适合只生成一个 `index.vue` 的场景；需要指定多个文件或子目录时请使用 YAML。

## 开发与验证

```bash
npm ci
npm test
npm run compile
```

在 VSCode 中按 `F5` 可以启动扩展开发主机进行手动验证。发布前可运行：

```bash
npx @vscode/vsce package --no-yarn
```

## 0.0.6 更新

- 修复枚举生成位置、字符串成员、注释转义和名称冲突判断
- 支持从命令面板安全执行枚举转换
- 修复 PascalCase、camelCase、kebab-case 转换
- 修复 Vite 项目误识别和多根工作区模板选择
- 限制自定义模板输出路径并升级 YAML 解析依赖
- 增加自动化回归测试和完整操作示例

## 许可证

[MIT](./LICENSE.txt)
