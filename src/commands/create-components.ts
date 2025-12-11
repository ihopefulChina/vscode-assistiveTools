import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import * as yaml from "js-yaml"

type TemplateType = "vue2" | "vue3" | "uniapp" | "taro" | "custom"

// 存储扩展路径
let extensionPath: string = ""

type CreateOptions = {
  /** 文件类型：component 或 page */
  type: "component" | "page"
  /** 模板类型 */
  templateType: TemplateType
  /** 文件名称 */
  name: string
  /** 目标目录 */
  targetDir: string
  /** 自定义模板路径（当 templateType 为 custom 时使用） */
  customTemplatePath?: string
}

type YamlTemplate = {
  name?: string
  description?: string
  tags?: string[]
  override?: string[]
  tpl?: Record<string, string>
}

/**
 * 获取默认模板路径
 */
function getDefaultTemplatePath(
  templateType: TemplateType,
  fileType: "component" | "page"
): string {
  if (!extensionPath) {
    // 尝试多种方式获取扩展路径
    // 方式1: 通过扩展ID获取（生产环境）
    const extension = vscode.extensions.getExtension("ihopefulChina.vscode-assistive-tools")
    if (extension) {
      extensionPath = extension.extensionPath
    } else {
      // 方式2: 通过当前文件路径推断（开发模式）
      const currentFile = __filename
      if (currentFile.includes("out")) {
        extensionPath = path.join(path.dirname(currentFile), "..")
      } else if (currentFile.includes("src")) {
        extensionPath = path.join(path.dirname(currentFile), "..")
      }
    }
  }

  const templateDir = path.join(extensionPath, "resources", "templates", templateType)
  const templateFile = path.join(templateDir, `${fileType}.template`)

  return templateFile
}

/**
 * 检查是否存在 .templates 目录
 */
function hasCustomTemplatesDir(): boolean {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return false
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath
  const templatesDir = path.join(workspaceRoot, ".templates")
  return fs.existsSync(templatesDir) && fs.statSync(templatesDir).isDirectory()
}

/**
 * 获取用户自定义模板路径（YAML 格式）
 */
function getUserYamlTemplatePath(fileType: "component" | "page"): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath
  const templatesDir = path.join(workspaceRoot, ".templates")

  // 尝试多种可能的文件名
  const possibleNames = [
    `vue-${fileType}.yml`,
    `vue-${fileType}.yaml`,
    `${fileType}.yml`,
    `${fileType}.yaml`,
  ]

  for (const name of possibleNames) {
    const templateFile = path.join(templatesDir, name)
    if (fs.existsSync(templateFile)) {
      return templateFile
    }
  }

  return null
}

/**
 * 获取用户自定义模板路径（旧格式 .template）
 */
function getUserTemplatePath(fileType: "component" | "page", customPath?: string): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath
  const templatesDir = path.join(workspaceRoot, ".templates")

  if (customPath) {
    return path.join(workspaceRoot, customPath)
  }

  const templateFile = path.join(templatesDir, `${fileType}.template`)
  return fs.existsSync(templateFile) ? templateFile : null
}

/**
 * 读取 YAML 模板
 */
function readYamlTemplate(templatePath: string): YamlTemplate {
  try {
    const content = fs.readFileSync(templatePath, "utf-8")
    const template = yaml.load(content) as YamlTemplate
    if (!template || !template.tpl) {
      throw new Error("YAML 模板格式错误：缺少 tpl 字段")
    }
    return template
  } catch (error: any) {
    throw new Error(`解析 YAML 模板失败: ${error.message}`)
  }
}

/**
 * 读取模板内容（支持 YAML 和普通模板）
 */
function readTemplate(options: CreateOptions): string | YamlTemplate {
  // 优先检查是否存在 .templates 目录（自定义模板）
  if (hasCustomTemplatesDir()) {
    const yamlTemplatePath = getUserYamlTemplatePath(options.type)
    if (yamlTemplatePath && fs.existsSync(yamlTemplatePath)) {
      // 使用 YAML 格式的自定义模板
      return readYamlTemplate(yamlTemplatePath)
    }

    // 尝试旧格式的 .template 文件
    const oldTemplatePath = getUserTemplatePath(options.type)
    if (oldTemplatePath && fs.existsSync(oldTemplatePath)) {
      return fs.readFileSync(oldTemplatePath, "utf-8")
    }
  }

  // 如果没有自定义模板，使用默认模板
  if (options.templateType === "custom") {
    // 使用自定义模板（如果指定了 customPath，使用它）
    if (options.customTemplatePath) {
      const templatePath = path.join(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
        options.customTemplatePath
      )
      if (!fs.existsSync(templatePath)) {
        throw new Error(`自定义模板不存在: ${templatePath}`)
      }
      // 检查是否是 YAML 文件
      if (templatePath.endsWith(".yml") || templatePath.endsWith(".yaml")) {
        return readYamlTemplate(templatePath)
      }
      return fs.readFileSync(templatePath, "utf-8")
    }
    // 如果没有指定 customPath，但选择了 custom，说明用户想用自定义模板但没找到
    throw new Error(
      `未找到自定义模板。请确保 .templates 目录中存在 ${
        options.type === "component" ? "vue-component.yml" : "vue-page.yml"
      } 或 ${options.type}.template 文件`
    )
  } else {
    const templatePath = getDefaultTemplatePath(options.templateType, options.type)
    if (!fs.existsSync(templatePath)) {
      throw new Error(`默认模板不存在: ${templatePath}`)
    }
    return fs.readFileSync(templatePath, "utf-8")
  }
}

/**
 * 替换模板变量（支持 ${variable} 和 [:=Variable:] 两种格式）
 */
function replaceTemplateVariables(
  template: string,
  name: string,
  type: "component" | "page"
): string {
  // 转换为 PascalCase
  const pascalName = name
    .split(/[-_\s]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")

  // 转换为 kebab-case
  const kebabName = name
    .split(/[-_\s]/)
    .map((word) => word.toLowerCase())
    .join("-")

  // 转换为 camelCase
  const camelName = name
    .split(/[-_\s]/)
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("")

  let result = template

  // 替换 ${variable} 格式
  result = result
    .replace(/\$\{name\}/g, name)
    .replace(/\$\{pascalName\}/g, pascalName)
    .replace(/\$\{kebabName\}/g, kebabName)
    .replace(/\$\{camelName\}/g, camelName)
    .replace(/\$\{type\}/g, type)
    .replace(/\$\{date\}/g, new Date().toLocaleDateString("zh-CN"))
    .replace(/\$\{time\}/g, new Date().toLocaleTimeString("zh-CN"))

  // 替换 [:=Variable:] 格式（YAML 模板常用格式）
  result = result
    .replace(/\[:=Name:\]/g, name)
    .replace(/\[:=PascalName:\]/g, pascalName)
    .replace(/\[:=KebabName:\]/g, kebabName)
    .replace(/\[:=CamelName:\]/g, camelName)
    .replace(/\[:=Type:\]/g, type)
    .replace(/\[:=Date:\]/g, new Date().toLocaleDateString("zh-CN"))
    .replace(/\[:=Time:\]/g, new Date().toLocaleTimeString("zh-CN"))

  return result
}

/**
 * 自动检测项目类型
 */
function detectProjectType(): TemplateType | null {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath
  const packageJsonPath = path.join(workspaceRoot, "package.json")

  if (!fs.existsSync(packageJsonPath)) {
    return null
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    }

    // 检测 Taro
    if (dependencies["@tarojs/taro"] || dependencies["@tarojs/cli"]) {
      return "taro"
    }

    // 检测 UniApp
    if (
      dependencies["@dcloudio/vite-plugin-uni"] ||
      dependencies["@dcloudio/uni-app"] ||
      dependencies["@dcloudio/uni-cli-shared"] ||
      fs.existsSync(path.join(workspaceRoot, "manifest.json")) ||
      fs.existsSync(path.join(workspaceRoot, "pages.json"))
    ) {
      return "uniapp"
    }

    // 检测 Vue 版本
    if (dependencies["vue"]) {
      const vueVersion = dependencies["vue"]
      // 检查是否是 Vue 3 (版本 >= 3.0.0)
      if (/^[\^~]?3\./.test(vueVersion) || /^[\^~]?[4-9]\./.test(vueVersion)) {
        return "vue3"
      }
      // 检查是否有 @vue/composition-api (Vue 2 + Composition API)
      if (dependencies["@vue/composition-api"]) {
        return "vue2"
      }
      // 默认 Vue 2
      if (/^[\^~]?2\./.test(vueVersion)) {
        return "vue2"
      }
    }

    // 检测 Vue 3 的其他特征
    if (dependencies["@vitejs/plugin-vue"] || dependencies["vite"]) {
      // 检查 vite.config 中是否有 vue 插件
      const viteConfigPath = path.join(workspaceRoot, "vite.config.js")
      const viteConfigTsPath = path.join(workspaceRoot, "vite.config.ts")
      if (fs.existsSync(viteConfigPath) || fs.existsSync(viteConfigTsPath)) {
        return "vue3"
      }
    }
  } catch (error) {
    // 解析失败，返回 null
    return null
  }

  return null
}

/**
 * 获取文件扩展名（根据模板类型）
 */
function getFileExtension(templateType: TemplateType): string {
  switch (templateType) {
    case "vue2":
    case "vue3":
    case "uniapp":
      return ".vue"
    case "taro":
      return ".tsx"
    case "custom":
      // 自定义模板时，尝试从模板内容推断
      return ".vue"
    default:
      return ".vue"
  }
}

/**
 * 类型守卫：判断是否为 YAML 模板
 */
function isYamlTemplate(template: string | YamlTemplate): template is YamlTemplate {
  return typeof template === "object" && template !== null && "tpl" in template && !!template.tpl
}

/**
 * 创建组件或页面（文件夹/index方式，支持多文件）
 */
async function createFile(options: CreateOptions): Promise<void> {
  try {
    // 读取模板
    const template = readTemplate(options)

    // 创建文件夹路径（文件夹名就是组件/页面名）
    const folderPath = path.join(options.targetDir, options.name)

    // 检查文件夹是否已存在
    if (fs.existsSync(folderPath)) {
      const overwrite = await vscode.window.showWarningMessage(
        `文件夹 ${options.name} 已存在，是否覆盖其中的文件？`,
        "覆盖",
        "取消"
      )
      if (overwrite !== "覆盖") {
        return
      }
    }

    // 确保目录存在
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true })
    }

    let firstFilePath: string | null = null

    // 判断是 YAML 模板还是普通模板
    if (isYamlTemplate(template)) {
      // YAML 模板：支持多文件
      const yamlTemplate = template
      const files = Object.keys(yamlTemplate.tpl || {})

      for (const fileName of files) {
        const fileContent = yamlTemplate.tpl![fileName]
        const filePath = path.join(folderPath, fileName)

        // 检查文件是否已存在
        if (fs.existsSync(filePath)) {
          const overwrite = await vscode.window.showWarningMessage(
            `文件 ${fileName} 已存在，是否覆盖？`,
            "覆盖",
            "取消"
          )
          if (overwrite !== "覆盖") {
            continue
          }
        }

        // 替换变量并写入文件
        const content = replaceTemplateVariables(fileContent, options.name, options.type)
        fs.writeFileSync(filePath, content, "utf-8")

        // 记录第一个文件路径，用于打开
        if (!firstFilePath) {
          firstFilePath = filePath
        }
      }
    } else {
      // 普通模板：单文件
      const templateContent = template as string
      const content = replaceTemplateVariables(templateContent, options.name, options.type)

      // 确定文件扩展名
      const ext = getFileExtension(options.templateType)
      const indexPath = path.join(folderPath, `index${ext}`)

      // 检查文件是否已存在
      if (fs.existsSync(indexPath)) {
        const overwrite = await vscode.window.showWarningMessage(
          `文件 index${ext} 已存在，是否覆盖？`,
          "覆盖",
          "取消"
        )
        if (overwrite !== "覆盖") {
          return
        }
      }

      // 写入文件
      fs.writeFileSync(indexPath, content, "utf-8")
      firstFilePath = indexPath
    }

    // 打开第一个文件
    if (firstFilePath) {
      const document = await vscode.workspace.openTextDocument(firstFilePath)
      await vscode.window.showTextDocument(document)
    }

    vscode.window.showInformationMessage(
      `成功创建${options.type === "component" ? "组件" : "页面"}: ${options.name}`
    )
  } catch (error: any) {
    vscode.window.showErrorMessage(`创建失败: ${error.message}`)
  }
}

/**
 * 显示模板选择器（支持自动检测）
 */
async function showTemplateSelector(type: "component" | "page"): Promise<TemplateType | undefined> {
  // 自动检测项目类型
  const detectedType = detectProjectType()

  const items: vscode.QuickPickItem[] = []

  // 如果检测到项目类型，将其放在第一位并标记为推荐
  if (detectedType && detectedType !== "custom") {
    const detectedLabel = {
      vue2: "Vue 2 (自动检测)",
      vue3: "Vue 3 (自动检测)",
      uniapp: "UniApp (自动检测)",
      taro: "Taro (自动检测)",
    }[detectedType]

    if (detectedLabel) {
      items.push({
        label: detectedLabel,
        description: getTemplateDescription(detectedType),
        detail: "根据项目配置自动检测",
      })
    }
  }

  // 添加所有模板选项
  const allTemplates: Array<{
    type: TemplateType
    label: string
    description: string
    detail: string
  }> = [
    {
      type: "vue2",
      label: "Vue 2",
      description: "@vue/composition-api + setup + scss",
      detail: "Vue 2 组件模板（使用 Composition API）",
    },
    {
      type: "vue3",
      label: "Vue 3",
      description: "setup + scss",
      detail: "Vue 3 组件模板",
    },
    {
      type: "uniapp",
      label: "UniApp",
      description: "setup + scss",
      detail: "UniApp 页面/组件模板",
    },
    {
      type: "taro",
      label: "Taro",
      description: "react + less",
      detail: "Taro 页面/组件模板",
    },
    {
      type: "custom",
      label: "自定义模板",
      description: "使用 .templates 目录中的模板",
      detail: "从工作区 .templates 目录读取自定义模板",
    },
  ]

  // 添加未检测到的模板选项
  allTemplates.forEach((template) => {
    // 如果已检测到，且是检测到的类型，跳过（已在前面添加）
    if (detectedType && template.type === detectedType) {
      return
    }
    items.push({
      label: template.label,
      description: template.description,
      detail: template.detail,
    })
  })

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: detectedType
      ? `选择${type === "component" ? "组件" : "页面"}模板类型（已自动检测为 ${detectedType}）`
      : `选择${type === "component" ? "组件" : "页面"}模板类型`,
  })

  if (!selected) {
    return undefined
  }

  // 如果选择的是自动检测的选项，直接返回检测到的类型
  if (detectedType && selected.label.includes("自动检测")) {
    return detectedType
  }

  const templateMap: Record<string, TemplateType> = {
    "Vue 2": "vue2",
    "Vue 3": "vue3",
    UniApp: "uniapp",
    Taro: "taro",
    自定义模板: "custom",
  }

  return templateMap[selected.label] || detectedType || undefined
}

/**
 * 获取模板描述
 */
function getTemplateDescription(templateType: TemplateType): string {
  const descriptions: Partial<Record<TemplateType, string>> = {
    vue2: "@vue/composition-api + setup + scss",
    vue3: "setup + scss",
    uniapp: "setup + scss",
    taro: "react + less",
    custom: "使用 .templates 目录中的模板",
  }
  return descriptions[templateType] || ""
}

/**
 * 显示文件名输入框
 */
async function showNameInput(type: "component" | "page"): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({
    prompt: `请输入${type === "component" ? "组件" : "页面"}名称`,
    placeHolder: `例如: My${type === "component" ? "Component" : "Page"}`,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return "名称不能为空"
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
        return "名称只能包含字母、数字、下划线和连字符，且必须以字母开头"
      }
      return null
    },
  })

  return name?.trim()
}

/**
 * 创建组件命令处理函数
 */
export async function createComponent(uri?: vscode.Uri) {
  const targetDir = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!targetDir) {
    vscode.window.showErrorMessage("无法确定目标目录")
    return
  }

  // 检查是否为目录
  const stat = fs.statSync(targetDir)
  const finalDir = stat.isDirectory() ? targetDir : path.dirname(targetDir)

  // 选择模板
  const templateType = await showTemplateSelector("component")
  if (!templateType) {
    return
  }

  // 输入名称
  const name = await showNameInput("component")
  if (!name) {
    return
  }

  // 创建文件
  await createFile({
    type: "component",
    templateType,
    name,
    targetDir: finalDir,
  })
}

/**
 * 创建页面命令处理函数
 */
export async function createPage(uri?: vscode.Uri) {
  const targetDir = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!targetDir) {
    vscode.window.showErrorMessage("无法确定目标目录")
    return
  }

  // 检查是否为目录
  const stat = fs.statSync(targetDir)
  const finalDir = stat.isDirectory() ? targetDir : path.dirname(targetDir)

  // 选择模板
  const templateType = await showTemplateSelector("page")
  if (!templateType) {
    return
  }

  // 输入名称
  const name = await showNameInput("page")
  if (!name) {
    return
  }

  // 创建文件
  await createFile({
    type: "page",
    templateType,
    name,
    targetDir: finalDir,
  })
}

/**
 * 注册创建组件和页面命令
 */
export default function registerCreateComponents(context: vscode.ExtensionContext) {
  // 设置扩展路径
  extensionPath = context.extensionPath

  // 注册创建组件命令
  context.subscriptions.push(
    vscode.commands.registerCommand("assistiveTools.createComponent", createComponent)
  )

  // 注册创建页面命令
  context.subscriptions.push(
    vscode.commands.registerCommand("assistiveTools.createPage", createPage)
  )
}
