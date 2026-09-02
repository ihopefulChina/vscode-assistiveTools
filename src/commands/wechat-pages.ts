import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import * as ts from "typescript"

export type MiniProgramPage = {
  name: string
  path: string
}

type MiniProgramCondition = {
  name?: string
  pathName?: string
  query?: string
  launchMode?: string
  scene?: unknown
  [key: string]: unknown
}

type ProjectPrivateConfig = {
  condition?: {
    miniprogram?: {
      list?: MiniProgramCondition[]
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}

export function parseMiniProgramPages(source: string, fileName = "app.config.ts"): MiniProgramPage[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const config = findConfigObject(sourceFile)
  if (!config) {
    throw new Error("没有找到可解析的页面配置对象")
  }

  const result: MiniProgramPage[] = []
  const pages = getArrayProperty(config, "pages")
  if (pages) {
    for (const element of pages.elements) {
      const pagePath = getLiteralText(element)
      if (pagePath) {
        result.push({ name: getPageName(element, sourceFile, pagePath), path: pagePath })
      }
    }
  }

  const subPackages = getArrayProperty(config, "subPackages") || getArrayProperty(config, "subpackages")
  if (subPackages) {
    for (const element of subPackages.elements) {
      if (!ts.isObjectLiteralExpression(element)) continue
      const root = getStringProperty(element, "root")
      const subPages = getArrayProperty(element, "pages")
      if (!root || !subPages) continue
      for (const pageElement of subPages.elements) {
        const page = getLiteralText(pageElement)
        if (!page) continue
        const pagePath = `${root.replace(/\/$/, "")}/${page.replace(/^\//, "")}`
        result.push({ name: getPageName(pageElement, sourceFile, pagePath), path: pagePath })
      }
    }
  }

  const unique = new Map<string, MiniProgramPage>()
  for (const page of result) unique.set(page.path, page)
  if (unique.size === 0) {
    throw new Error("页面配置中没有找到字面量 pages 或 subPackages.pages")
  }
  return [...unique.values()]
}

function findConfigObject(sourceFile: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
  const variables = new Map<string, ts.Expression>()
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          variables.set(declaration.name.text, declaration.initializer)
        }
      }
    }
  }

  const unwrap = (expression: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined => {
    if (!expression) return undefined
    if (ts.isParenthesizedExpression(expression)) return unwrap(expression.expression)
    if (
      ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) ||
      ts.isSatisfiesExpression(expression)
    ) {
      return unwrap(expression.expression)
    }
    if (ts.isCallExpression(expression)) return unwrap(expression.arguments[0])
    if (ts.isIdentifier(expression)) return unwrap(variables.get(expression.text))
    return ts.isObjectLiteralExpression(expression) ? expression : undefined
  }

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      const value = unwrap(statement.expression)
      if (value) return value
    }
  }

  for (const expression of variables.values()) {
    const value = unwrap(expression)
    if (value && (getProperty(value, "pages") || getProperty(value, "subPackages"))) {
      return value
    }
  }
  return undefined
}

export function findMiniProgramProjectRoot(sourcePath: string, workspaceRoot: string): string {
  let current = path.dirname(sourcePath)
  const normalizedWorkspace = path.resolve(workspaceRoot)
  let nearestPackageRoot: string | undefined

  while (true) {
    if (
      fs.existsSync(path.join(current, "project.config.json")) ||
      fs.existsSync(path.join(current, "project.private.config.json"))
    ) {
      return current
    }
    if (!nearestPackageRoot && fs.existsSync(path.join(current, "package.json"))) {
      nearestPackageRoot = current
    }
    if (path.resolve(current) === normalizedWorkspace) {
      break
    }
    const parent = path.dirname(current)
    if (parent === current || !isPathInsideOrEqual(normalizedWorkspace, parent)) {
      break
    }
    current = parent
  }
  return nearestPackageRoot || normalizedWorkspace
}

function isPathInsideOrEqual(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function getProperty(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && getPropertyName(property.name) === name
  )
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function getArrayProperty(
  object: ts.ObjectLiteralExpression,
  name: string
): ts.ArrayLiteralExpression | undefined {
  const initializer = getProperty(object, name)?.initializer
  return initializer && ts.isArrayLiteralExpression(initializer) ? initializer : undefined
}

function getStringProperty(object: ts.ObjectLiteralExpression, name: string): string | undefined {
  return getLiteralText(getProperty(object, name)?.initializer)
}

function getLiteralText(node?: ts.Expression): string | undefined {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text
  }
  return undefined
}

function getPageName(node: ts.Node, sourceFile: ts.SourceFile, fallback: string): string {
  const source = sourceFile.getFullText()
  const leading = ts.getLeadingCommentRanges(source, node.getFullStart()) || []
  const comment = leading.length > 0 ? source.slice(leading[leading.length - 1].pos, leading[leading.length - 1].end) : ""
  const cleaned = comment
    .replace(/^\/\*+/, "")
    .replace(/\*+\/$/, "")
    .replace(/^\/\//, "")
    .replace(/^\s*\*\s?/gm, "")
    .trim()
  return `💻${cleaned || fallback}`
}

export function mergeMiniProgramConditions(
  sourceConfig: ProjectPrivateConfig,
  pages: MiniProgramPage[]
): { config: ProjectPrivateConfig; added: number; updated: number } {
  const config = JSON.parse(JSON.stringify(sourceConfig || {})) as ProjectPrivateConfig
  if (config.condition !== undefined && !isRecord(config.condition)) {
    throw new Error("project.private.config.json 的 condition 必须是对象")
  }
  config.condition ||= {}
  if (config.condition.miniprogram !== undefined && !isRecord(config.condition.miniprogram)) {
    throw new Error("project.private.config.json 的 condition.miniprogram 必须是对象")
  }
  config.condition.miniprogram ||= {}
  if (
    config.condition.miniprogram.list !== undefined &&
    !Array.isArray(config.condition.miniprogram.list)
  ) {
    throw new Error("project.private.config.json 的 condition.miniprogram.list 必须是数组")
  }
  const list = config.condition.miniprogram.list || []
  config.condition.miniprogram.list = list

  let added = 0
  let updated = 0
  for (const page of pages) {
    const existing = list.find((item) => item.pathName === page.path)
    if (existing) {
      if (typeof existing.name === "string" && existing.name.startsWith("💻") && existing.name !== page.name) {
        existing.name = page.name
        updated += 1
      }
      continue
    }
    list.push({
      name: page.name,
      pathName: page.path,
      query: "",
      launchMode: "default",
      scene: null,
    })
    added += 1
  }
  return { config, added, updated }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function syncMiniProgramPages(uri?: vscode.Uri): Promise<void> {
  const sourceUri = uri || vscode.window.activeTextEditor?.document.uri
  if (!sourceUri || !/^(app|pages)\.config\.ts$/.test(path.basename(sourceUri.fsPath))) {
    vscode.window.showWarningMessage("请在 app.config.ts 或 pages.config.ts 上执行同步命令")
    return
  }
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(sourceUri)
  if (!workspaceFolder) {
    vscode.window.showWarningMessage("页面配置文件不在已打开的工作区中")
    return
  }

  try {
    const pages = parseMiniProgramPages(fs.readFileSync(sourceUri.fsPath, "utf-8"), sourceUri.fsPath)
    const projectRoot = findMiniProgramProjectRoot(
      sourceUri.fsPath,
      workspaceFolder.uri.fsPath
    )
    const targetPath = path.join(projectRoot, "project.private.config.json")
    let current: ProjectPrivateConfig = {}
    if (fs.existsSync(targetPath)) {
      current = JSON.parse(fs.readFileSync(targetPath, "utf-8")) as ProjectPrivateConfig
    }
    const merged = mergeMiniProgramConditions(current, pages)
    if (merged.added === 0 && merged.updated === 0) {
      vscode.window.showInformationMessage(`页面调试配置已是最新状态，共 ${pages.length} 个页面`)
      return
    }

    const action = fs.existsSync(targetPath) ? "同步" : "创建并同步"
    const confirmed = await vscode.window.showInformationMessage(
      `同步 ${pages.length} 个页面到 project.private.config.json`,
      {
        modal: true,
        detail: `新增 ${merged.added} 项，更新 ${merged.updated} 项。现有 query、scene、launchMode 和手工命名均会保留。`,
      },
      action
    )
    if (confirmed !== action) return

    fs.writeFileSync(targetPath, `${JSON.stringify(merged.config, null, 2)}\n`, "utf-8")
    vscode.window.showInformationMessage(
      `同步完成：新增 ${merged.added} 项，更新 ${merged.updated} 项`
    )
  } catch (error: any) {
    vscode.window.showErrorMessage(`同步失败: ${error.message}`)
  }
}

export function registerWechatPageSync(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("assistiveTools.wechat.syncPages", syncMiniProgramPages),
    vscode.workspace.onDidSaveTextDocument((document) => {
      const enabled = vscode.workspace
        .getConfiguration("assistiveTools.wechat")
        .get<boolean>("syncOnSave", false)
      if (enabled && /^(app|pages)\.config\.ts$/.test(path.basename(document.uri.fsPath))) {
        void syncMiniProgramPages(document.uri)
      }
    })
  )
}
