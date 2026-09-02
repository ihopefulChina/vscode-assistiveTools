import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import * as yaml from "js-yaml"

type BuiltInTemplateType = "vue2" | "vue3" | "uniapp" | "taro"
type TemplateType = BuiltInTemplateType | "custom"

type TemplateSelection = {
  templateType: TemplateType
  customTemplatePath?: string
  label: string
}

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
  /** 当前操作所属的工作区根目录 */
  workspaceRoot: string
  /** 自定义模板路径（当 templateType 为 custom 时使用） */
  customTemplatePath?: string
}

type YamlTemplate = {
  name?: string
  description?: string
  tags?: string[]
  type?: "component" | "page" | "both"
  override?: string[]
  tpl?: Record<string, string>
}

export type CustomTemplateInfo = {
  name: string
  description: string
  tags: string[]
  type: "component" | "page" | "both"
  relativePath: string
  absolutePath: string
  format: "yaml" | "legacy"
}

type GenerationPlan = {
  folderPath: string
  files: Array<{
    relativePath: string
    absolutePath: string
    content: string
    exists: boolean
  }>
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
function hasCustomTemplatesDir(workspaceRoot: string): boolean {
  const templatesDir = path.join(workspaceRoot, ".templates")
  return fs.existsSync(templatesDir) && fs.statSync(templatesDir).isDirectory()
}

/**
 * 获取用户自定义模板路径（YAML 格式）
 */
function getUserYamlTemplatePath(
  workspaceRoot: string,
  fileType: "component" | "page"
): string | null {
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
function getUserTemplatePath(
  workspaceRoot: string,
  fileType: "component" | "page",
  customPath?: string
): string | null {
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

function inferTemplateType(
  fileName: string,
  declaredType?: YamlTemplate["type"]
): "component" | "page" | "both" {
  if (declaredType === "component" || declaredType === "page" || declaredType === "both") {
    return declaredType
  }
  const normalized = fileName.toLowerCase()
  if (/(^|[-_.])component([-_.]|$)/.test(normalized)) {
    return "component"
  }
  if (/(^|[-_.])page([-_.]|$)/.test(normalized)) {
    return "page"
  }
  return "both"
}

export function discoverCustomTemplates(workspaceRoot: string): CustomTemplateInfo[] {
  const templatesDir = path.join(workspaceRoot, ".templates")
  if (!fs.existsSync(templatesDir) || !fs.statSync(templatesDir).isDirectory()) {
    return []
  }

  return fs
    .readdirSync(templatesDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".yml") ||
          entry.name.endsWith(".yaml") ||
          entry.name.endsWith(".template"))
    )
    .map((entry): CustomTemplateInfo => {
      const absolutePath = path.join(templatesDir, entry.name)
      const relativePath = path.relative(workspaceRoot, absolutePath)
      if (entry.name.endsWith(".template")) {
        return {
          name: path.basename(entry.name, ".template"),
          description: "旧格式单文件模板",
          tags: ["legacy"],
          type: inferTemplateType(entry.name),
          relativePath,
          absolutePath,
          format: "legacy",
        }
      }

      const template = readYamlTemplate(absolutePath)
      return {
        name: template.name?.trim() || path.basename(entry.name, path.extname(entry.name)),
        description: template.description?.trim() || "YAML 多文件模板",
        tags: Array.isArray(template.tags)
          ? template.tags.filter((tag): tag is string => typeof tag === "string")
          : [],
        type: inferTemplateType(entry.name, template.type),
        relativePath,
        absolutePath,
        format: "yaml",
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"))
}

export function validateCustomTemplates(workspaceRoot: string): string[] {
  const errors: string[] = []
  let templates: CustomTemplateInfo[] = []
  try {
    templates = discoverCustomTemplates(workspaceRoot)
  } catch (error: any) {
    return [error.message]
  }

  for (const info of templates) {
    try {
      if (info.format === "legacy") {
        if (!fs.readFileSync(info.absolutePath, "utf-8").trim()) {
          throw new Error("模板内容为空")
        }
        continue
      }

      const template = readYamlTemplate(info.absolutePath)
      const files = Object.entries(template.tpl || {})
      if (files.length === 0) {
        throw new Error("tpl 至少需要包含一个输出文件")
      }
      for (const [fileName, content] of files) {
        validateTemplateRelativePath(fileName)
        if (typeof content !== "string") {
          throw new Error(`文件内容必须是字符串: ${fileName}`)
        }
      }
    } catch (error: any) {
      errors.push(`${info.relativePath}: ${error.message}`)
    }
  }
  return errors
}

/**
 * 读取模板内容（支持 YAML 和普通模板）
 */
function readTemplate(options: CreateOptions): string | YamlTemplate {
  if (options.templateType === "custom") {
    if (options.customTemplatePath) {
      const templatePath = path.join(options.workspaceRoot, options.customTemplatePath)
      if (!fs.existsSync(templatePath)) {
        throw new Error(`自定义模板不存在: ${templatePath}`)
      }
      if (templatePath.endsWith(".yml") || templatePath.endsWith(".yaml")) {
        return readYamlTemplate(templatePath)
      }
      return fs.readFileSync(templatePath, "utf-8")
    }

    if (hasCustomTemplatesDir(options.workspaceRoot)) {
      const yamlTemplatePath = getUserYamlTemplatePath(options.workspaceRoot, options.type)
      if (yamlTemplatePath) {
        return readYamlTemplate(yamlTemplatePath)
      }

      const oldTemplatePath = getUserTemplatePath(options.workspaceRoot, options.type)
      if (oldTemplatePath) {
        return fs.readFileSync(oldTemplatePath, "utf-8")
      }
    }

    throw new Error(
      `未找到自定义模板。请确保 .templates 目录中存在 ${
        options.type === "component" ? "vue-component.yml" : "vue-page.yml"
      } 或 ${options.type}.template 文件`
    )
  }

  const templatePath = getDefaultTemplatePath(options.templateType, options.type)
  if (!fs.existsSync(templatePath)) {
    throw new Error(`默认模板不存在: ${templatePath}`)
  }
  return fs.readFileSync(templatePath, "utf-8")
}

/**
 * 替换模板变量（支持 ${variable} 和 [:=Variable:] 两种格式）
 */
export function replaceTemplateVariables(
  template: string,
  name: string,
  type: "component" | "page"
): string {
  const words = splitNameWords(name)
  const pascalName = words.map(capitalizeWord).join("")
  const kebabName = words.join("-")
  const camelName = words.map((word, index) => (index === 0 ? word : capitalizeWord(word))).join("")

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

function splitNameWords(name: string): string[] {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
}

function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/**
 * 自动检测项目类型
 */
export function detectProjectType(workspaceRoot: string): TemplateType | null {
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

    // 仅在明确安装 Vue 插件时将 Vite 项目识别为 Vue 3
    if (dependencies["@vitejs/plugin-vue"]) {
      return "vue3"
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

export function resolveTemplateOutputPath(folderPath: string, fileName: string): string {
  validateTemplateRelativePath(fileName)

  const resolvedFolder = path.resolve(folderPath)
  const resolvedFile = path.resolve(resolvedFolder, fileName)
  if (!isPathInside(resolvedFolder, resolvedFile) || resolvedFile === resolvedFolder) {
    throw new Error(`模板文件只能创建在目标文件夹内: ${fileName}`)
  }

  const existingAncestor = findNearestExistingAncestor(path.dirname(resolvedFile))
  if (fs.existsSync(resolvedFolder)) {
    const realFolder = fs.realpathSync(resolvedFolder)
    const realAncestor = fs.realpathSync(existingAncestor)
    if (!isPathInside(realFolder, realAncestor) && realFolder !== realAncestor) {
      throw new Error(`模板文件路径不能通过符号链接离开目标文件夹: ${fileName}`)
    }
    if (hasSymlinkSegment(resolvedFolder, path.dirname(resolvedFile))) {
      throw new Error(`模板文件路径不能通过符号链接离开目标文件夹: ${fileName}`)
    }
  }

  return resolvedFile
}

function validateTemplateRelativePath(fileName: string): void {
  if (!fileName.trim() || path.isAbsolute(fileName) || fileName.includes("\0")) {
    throw new Error(`模板文件路径无效: ${fileName}`)
  }
}

function findNearestExistingAncestor(targetPath: string): string {
  let current = targetPath
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return current
}

function hasSymlinkSegment(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return false
  }
  let current = rootPath
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) {
      return false
    }
    if (fs.lstatSync(current).isSymbolicLink()) {
      return true
    }
  }
  return false
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath)
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  )
}

/**
 * 创建组件或页面（文件夹/index方式，支持多文件）
 */
async function createFile(options: CreateOptions): Promise<void> {
  try {
    const template = readTemplate(options)
    const plan = buildGenerationPlan(options, template)
    const conflicts = plan.files.filter((file) => file.exists)
    const detailLines = plan.files.map(
      (file) => `${file.exists ? "将覆盖" : "将创建"}  ${file.relativePath}`
    )
    const action = conflicts.length > 0 ? "覆盖并创建" : "创建"
    const confirmed = await vscode.window.showInformationMessage(
      `预览：${options.name} 将生成 ${plan.files.length} 个文件`,
      {
        modal: true,
        detail: detailLines.slice(0, 30).join("\n"),
      },
      action
    )
    if (confirmed !== action) {
      return
    }

    fs.mkdirSync(plan.folderPath, { recursive: true })
    for (const file of plan.files) {
      fs.mkdirSync(path.dirname(file.absolutePath), { recursive: true })
      fs.writeFileSync(file.absolutePath, file.content, "utf-8")
    }

    const firstFilePath = plan.files[0]?.absolutePath

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

function buildGenerationPlan(
  options: CreateOptions,
  template: string | YamlTemplate
): GenerationPlan {
  const folderPath = path.join(options.targetDir, options.name)
  if (fs.existsSync(folderPath) && fs.lstatSync(folderPath).isSymbolicLink()) {
    throw new Error(`目标文件夹不能是符号链接: ${options.name}`)
  }

  const rawFiles: Array<{ relativePath: string; content: string }> = []
  if (isYamlTemplate(template)) {
    for (const [relativePath, content] of Object.entries(template.tpl || {})) {
      if (typeof content !== "string") {
        throw new Error(`模板文件内容必须是字符串: ${relativePath}`)
      }
      rawFiles.push({ relativePath, content })
    }
  } else {
    rawFiles.push({
      relativePath: `index${getFileExtension(options.templateType)}`,
      content: template,
    })
  }
  if (rawFiles.length === 0) {
    throw new Error("模板没有定义任何输出文件")
  }

  const seen = new Set<string>()
  const files = rawFiles.map((file) => {
    const absolutePath = resolveTemplateOutputPath(folderPath, file.relativePath)
    const normalized = path.normalize(absolutePath)
    if (seen.has(normalized)) {
      throw new Error(`模板包含重复输出路径: ${file.relativePath}`)
    }
    seen.add(normalized)
    if (fs.existsSync(absolutePath) && fs.lstatSync(absolutePath).isSymbolicLink()) {
      throw new Error(`模板文件不能覆盖符号链接: ${file.relativePath}`)
    }
    return {
      relativePath: file.relativePath,
      absolutePath,
      content: replaceTemplateVariables(file.content, options.name, options.type),
      exists: fs.existsSync(absolutePath),
    }
  })

  return { folderPath, files }
}

/**
 * 显示模板选择器（支持自动检测）
 */
async function showTemplateSelector(
  type: "component" | "page",
  workspaceRoot: string
): Promise<TemplateSelection | undefined> {
  // 自动检测项目类型
  const detectedType = detectProjectType(workspaceRoot)

  type TemplateQuickPickItem = vscode.QuickPickItem & { selection: TemplateSelection }
  const items: TemplateQuickPickItem[] = []

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
        selection: {
          templateType: detectedType,
          label: detectedLabel,
        },
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
      selection: {
        templateType: template.type,
        label: template.label,
      },
    })
  })

  let customTemplates: CustomTemplateInfo[] = []
  try {
    customTemplates = discoverCustomTemplates(workspaceRoot).filter(
      (template) => template.type === type || template.type === "both"
    )
  } catch (error: any) {
    vscode.window.showWarningMessage(`读取自定义模板失败: ${error.message}`)
  }

  for (const template of customTemplates) {
    const tagDetail = template.tags.map((tag) => `#${tag}`).join(" ")
    items.push({
      label: `$(file-code) ${template.name}`,
      description: template.description,
      detail: [template.relativePath, tagDetail].filter(Boolean).join(" · "),
      selection: {
        templateType: "custom",
        customTemplatePath: template.relativePath,
        label: template.name,
      },
    })
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: detectedType
      ? `选择${type === "component" ? "组件" : "页面"}模板类型（已自动检测为 ${detectedType}）`
      : `选择${type === "component" ? "组件" : "页面"}模板类型`,
  })

  if (!selected) {
    return undefined
  }

  return selected.selection
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
  const finalDir = resolveTargetDirectory(uri)
  if (!finalDir) {
    return
  }
  const workspaceRoot = getWorkspaceRoot(finalDir)

  // 选择模板
  const template = await showTemplateSelector("component", workspaceRoot)
  if (!template) {
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
    templateType: template.templateType,
    name,
    targetDir: finalDir,
    workspaceRoot,
    customTemplatePath: template.customTemplatePath,
  })
}

/**
 * 创建页面命令处理函数
 */
export async function createPage(uri?: vscode.Uri) {
  const finalDir = resolveTargetDirectory(uri)
  if (!finalDir) {
    return
  }
  const workspaceRoot = getWorkspaceRoot(finalDir)

  // 选择模板
  const template = await showTemplateSelector("page", workspaceRoot)
  if (!template) {
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
    templateType: template.templateType,
    name,
    targetDir: finalDir,
    workspaceRoot,
    customTemplatePath: template.customTemplatePath,
  })
}

function resolveTargetDirectory(uri?: vscode.Uri): string | undefined {
  const targetPath = uri?.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!targetPath) {
    vscode.window.showErrorMessage("无法确定目标目录")
    return undefined
  }

  try {
    const stat = fs.statSync(targetPath)
    return stat.isDirectory() ? targetPath : path.dirname(targetPath)
  } catch (error: any) {
    vscode.window.showErrorMessage(`无法访问目标目录: ${error.message}`)
    return undefined
  }
}

export function getWorkspaceRoot(targetDir: string): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(targetDir))
  return (
    workspaceFolder?.uri.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || targetDir
  )
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
