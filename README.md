# VSCode Assistive Tools

VSCode 辅助工具插件，提供枚举悬停转换和快速创建组件/页面等功能。

## 插件地址

[marketplace](https://marketplace.visualstudio.com/items?itemName=ihopefulChina.vscode-assistive-tools)

[open VSX](https://open-vsx.org/extension/ihopefulChina/vscode-assistive-tools)

## 功能

### 1. 枚举悬停转换

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

### 2. 快速创建组件和页面

通过右键菜单快速创建组件和页面，支持自动检测项目类型和自定义模板。

#### 功能特性

- ✅ **自动检测项目类型**：自动识别 Vue2、Vue3、UniApp、Taro 等项目类型
- ✅ **文件夹/index 方式**：所有组件和页面都以文件夹方式创建，包含 `index.vue` 或 `index.tsx` 文件
- ✅ **自定义模板支持**：支持 YAML 格式的自定义模板，可同时创建多个文件
- ✅ **变量替换**：支持多种变量格式，自动替换组件/页面名称

#### 使用方法

1. 在 VSCode 资源管理器中，右键点击文件夹或文件
2. 选择"创建组件"或"创建页面"
3. 选择模板类型（会自动推荐检测到的项目类型）
4. 输入组件/页面名称
5. 自动创建文件夹和文件

#### 支持的默认模板

- **Vue 2**：`@vue/composition-api + setup + scss`
- **Vue 3**：`setup + scss`
- **UniApp**：`setup + scss`
- **Taro**：`react + less`

## 自定义模板

### 模板优先级

插件会按以下优先级查找模板：

1. **`.templates` 目录中的自定义模板**（优先使用）
   - YAML 格式：`vue-component.yml` / `vue-page.yml` 或 `component.yml` / `page.yml`
   - 旧格式：`component.template` / `page.template`
2. **插件内置默认模板**

### YAML 模板格式

在项目根目录创建 `.templates` 目录，放置 YAML 格式的模板文件。

#### 模板文件命名规则

- 组件模板：`vue-component.yml`、`component.yml` 或 `component.template`
- 页面模板：`vue-page.yml`、`page.yml` 或 `page.template`

#### YAML 模板结构

```yaml
# 模板名称
name: "vue-component"
# 详细描述
description: "Vue2 + TypeScript + Composition API 组件模板"
# 标签（可选）
tags: ["vue2", "typescript", "composition-api", "component"]
# 是否覆盖创建组件/页面（可选）
override: ["vue-component"]
# 模板内容（必需）
tpl:
  # 文件名: 文件内容
  index.vue: |
    <template>
      <div class="[:=PascalName:]"></div>
    </template>

    <script lang="ts">
    export default defineComponent({
      name: "[:=PascalName:]",
    })
    </script>

    <style lang="scss" scoped src="./index.scss"></style>
  # 可以创建多个文件
  index.scss: |
    .[:=PascalName:] {
    }
```

#### 支持的模板变量

插件支持两种变量格式：

**格式一：`[:=Variable:]`（YAML 模板常用）**

- `[:=Name:]` - 原始名称（用户输入的原始名称）
- `[:=PascalName:]` - PascalCase 格式（如：`MyComponent`）
- `[:=KebabName:]` - kebab-case 格式（如：`my-component`）
- `[:=CamelName:]` - camelCase 格式（如：`myComponent`）
- `[:=Type:]` - 类型（`component` 或 `page`）
- `[:=Date:]` - 当前日期（如：`2024/1/1`）
- `[:=Time:]` - 当前时间（如：`14:30:00`）

**格式二：`${variable}`（标准格式）**

- `${name}` - 原始名称
- `${pascalName}` - PascalCase 格式
- `${kebabName}` - kebab-case 格式
- `${camelName}` - camelCase 格式
- `${type}` - 类型
- `${date}` - 当前日期
- `${time}` - 当前时间

#### 完整示例

**`.templates/vue-component.yml`**

```yaml
# 模板名称
name: "vue-component"
# 详细描述
description: "Vue2 + TypeScript + Composition API 组件模板"
# 标签
tags: ["vue2", "typescript", "composition-api", "component"]
# 模板内容
tpl:
  index.vue: |
    <template>
      <div class="[:=KebabName:]">
        <!-- [:={PascalName}:] 组件 -->
      </div>
    </template>

    <script lang="ts">
    import { defineComponent, PropType } from "@vue/composition-api"
    import { useState } from "@/hooks/useState"

    export default defineComponent({
      name: "[:=PascalName:]",
      props: {},
      emits: [],
      setup(props, { emit }) {
        /** 状态管理 */
        const [state, setState] = useState()

        return {
          state,
        }
      },
    })
    </script>

    <style lang="scss" scoped src="./index.scss"></style>
  index.scss: |
    .[:=KebabName:] {
      // 组件样式
    }
```

**`.templates/vue-page.yml`**

```yaml
# 模板名称
name: "vue-page"
# 详细描述
description: "Vue2 + TypeScript + Composition API 页面模板"
# 标签
tags: ["vue2", "typescript", "composition-api"]
# 模板内容
tpl:
  index.vue: |
    <template>
      <PageContainer>
        <div class="[:=KebabName:]"></div>
      </PageContainer>
    </template>

    <script lang="ts">
    import { defineComponent } from "@vue/composition-api"
    import { useState } from "@/hooks/useState"
    import { useRouterParams } from "@/hooks/useRouterParams"
    import PageContainer from "@/layout/pageContainer/index.vue"
    import { RouteParams } from "@/router/RouteParams"

    export default defineComponent({
      name: "[:=PascalName:]",
      components: { PageContainer },
      setup() {
        /** 路由参数 */
        const { id } = useRouterParams<RouteParams["[:=PascalName:]"]>()
        
        /** 状态管理 */
        const [state, setState] = useState()

        return {
          state
        }
      },
    })
    </script>

    <style lang="scss" scoped src="./index.scss"></style>
  index.scss: |
    .[:=KebabName:] {
      // 页面样式
    }
```

### 旧格式模板（.template 文件）

如果你不想使用 YAML 格式，也可以使用简单的 `.template` 文件：

**`.templates/component.template`**

```
<template>
  <div class="${kebabName}">
    <!-- ${pascalName} 组件 -->
  </div>
</template>

<script lang="ts">
export default defineComponent({
  name: "${pascalName}",
})
</script>

<style lang="scss" scoped>
.${kebabName} {
}
</style>
```

### 多文件模板示例

YAML 模板支持同时创建多个文件，例如：

```yaml
tpl:
  index.vue: |
    <template>...</template>
    <script>...</script>
  index.scss: |
    .component { }
  types.ts: |
    export interface ${pascalName}Props {}
  index.test.ts: |
    describe('${pascalName}', () => {})
```

创建组件 `MyComponent` 时，会在 `MyComponent/` 文件夹下创建：

- `index.vue`
- `index.scss`
- `types.ts`
- `index.test.ts`

### 模板使用场景

1. **项目特定规范**：统一项目的组件/页面结构
2. **多文件组件**：同时创建样式、类型定义、测试文件等
3. **框架特定模板**：针对不同框架（Vue2/Vue3/React）定制模板
4. **团队协作**：团队成员共享统一的代码模板

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

## 许可证

MIT
