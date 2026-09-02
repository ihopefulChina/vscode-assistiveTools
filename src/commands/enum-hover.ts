import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import type * as TypeScript from "typescript"

const ts: typeof TypeScript = loadTypescriptModule()

type EnumCommandArgument = {
  sourceUri: string
  enumName: string
  enumStart: number
}

type EnumChild = {
  access: string
  comment: string
}

type EnumNameMap = {
  name: string
  mapName: string
  optionName: string
}

type EnumParseResult = {
  declaration: TypeScript.EnumDeclaration
  sourceFile: TypeScript.SourceFile
  nameMap: EnumNameMap
  children: EnumChild[]
  collisions: string[]
}

/**
 * 枚举悬停转换
 */
class HoverProvider implements vscode.HoverProvider {
  public provideHover(document: vscode.TextDocument, position: vscode.Position) {
    const target = getEnumTarget(document, position)
    if (!target) {
      return
    }

    const args: EnumCommandArgument[] = [target]
    const commandUri = vscode.Uri.parse(
      `command:assistiveTools.convertEnum?${encodeURIComponent(JSON.stringify(args))}`
    )
    const markdownString = new vscode.MarkdownString(`[生成枚举转换](${commandUri})`)
    markdownString.isTrusted = true
    return new vscode.Hover(markdownString)
  }
}

/**
 * 注册鼠标悬停提示和枚举转换命令
 */
export default function registerEnumHover(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ["typescript", "typescriptreact", "javascript", "javascriptreact"],
      new HoverProvider()
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "assistiveTools.convertEnum",
      async (argument?: EnumCommandArgument) => {
        const target = await resolveCommandTarget(argument)
        if (!target) {
          return
        }

        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(target.sourceUri))
        const result = parseEnum(document, target)
        if (!result) {
          return showAutoClosingInformationMessage("未找到枚举定义，请重新将光标置于枚举名称上")
        }

        if (result.collisions.length > 0) {
          return showAutoClosingInformationMessage(
            `转换代码已存在或名称冲突：${result.collisions.join("、")}`
          )
        }

        const generated = renderEnumConversion(document, result)
        const edit = new vscode.WorkspaceEdit()
        edit.insert(
          document.uri,
          document.positionAt(result.declaration.getEnd()),
          `\n\n${generated}`
        )

        const applied = await vscode.workspace.applyEdit(edit)
        if (!applied) {
          vscode.window.showErrorMessage("生成失败：编辑器未能应用代码变更")
          return
        }

        showAutoClosingInformationMessage("生成成功", 300)
      }
    )
  )
}

export function deriveEnumNames(enumName: string): EnumNameMap {
  const baseName = /^E[A-Z0-9_]/.test(enumName) ? enumName.slice(1) : enumName
  return {
    name: enumName,
    mapName: `M${baseName}`,
    optionName: `O${baseName}`,
  }
}

function getEnumTarget(
  document: vscode.TextDocument,
  position: vscode.Position
): EnumCommandArgument | undefined {
  const sourceFile = createSourceFile(document)
  if (sourceFile.isDeclarationFile) {
    return undefined
  }

  const offset = document.offsetAt(position)
  const declaration = findEnumAtOffset(sourceFile, offset)
  if (!declaration || !isSupportedEnum(declaration) || hasDeclareModifier(declaration)) {
    return undefined
  }

  return {
    sourceUri: document.uri.toString(),
    enumName: declaration.name.text,
    enumStart: declaration.getStart(sourceFile),
  }
}

async function resolveCommandTarget(
  argument?: EnumCommandArgument
): Promise<EnumCommandArgument | undefined> {
  if (
    argument &&
    typeof argument.sourceUri === "string" &&
    typeof argument.enumName === "string" &&
    typeof argument.enumStart === "number"
  ) {
    return argument
  }

  const editor = vscode.window.activeTextEditor
  if (!editor) {
    showAutoClosingInformationMessage("请先打开 TypeScript/JavaScript 文件并将光标置于枚举名称上")
    return undefined
  }

  const target = getEnumTarget(editor.document, editor.selection.active)
  if (!target) {
    showAutoClosingInformationMessage("请将光标置于可转换的枚举名称上")
  }
  return target
}

function parseEnum(
  document: vscode.TextDocument,
  target: EnumCommandArgument
): EnumParseResult | undefined {
  const sourceFile = createSourceFile(document)
  const declaration = findEnumByIdentity(sourceFile, target.enumName, target.enumStart)
  if (
    !declaration ||
    !isSupportedEnum(declaration) ||
    sourceFile.isDeclarationFile ||
    hasDeclareModifier(declaration)
  ) {
    return undefined
  }

  const nameMap = deriveEnumNames(declaration.name.text)
  const bindings = collectScopeValueBindings(declaration)
  const collisions = [nameMap.mapName, nameMap.optionName].filter((name) => bindings.has(name))
  const children = declaration.members.map((member) => ({
    access: createMemberAccess(declaration.name.text, member, sourceFile),
    comment: getMemberComment(member, sourceFile),
  }))

  return {
    declaration,
    sourceFile,
    nameMap,
    children,
    collisions,
  }
}

function renderEnumConversion(document: vscode.TextDocument, result: EnumParseResult): string {
  const startLine = document.positionAt(result.declaration.getStart(result.sourceFile)).line
  const indent = document.lineAt(startLine).text.match(/^\s*/)?.[0] ?? ""
  const exportPrefix =
    ts.isSourceFile(result.declaration.parent) || ts.isModuleBlock(result.declaration.parent)
      ? "export "
      : ""

  const lines: string[] = [`${exportPrefix}const ${result.nameMap.mapName} = {`]
  result.children.forEach((item, index) => {
    lines.push(
      `  [${item.access}]: ${JSON.stringify(item.comment)}${
        index < result.children.length - 1 ? "," : ""
      }`
    )
  })
  lines.push("}", "", `${exportPrefix}const ${result.nameMap.optionName} = [`)
  result.children.forEach((item, index) => {
    lines.push(
      `  { value: ${item.access}, label: ${JSON.stringify(item.comment)} }${
        index < result.children.length - 1 ? "," : ""
      }`
    )
  })
  lines.push("]")

  return lines.map((line) => (line ? `${indent}${line}` : "")).join("\n")
}

function createSourceFile(document: vscode.TextDocument): TypeScript.SourceFile {
  return ts.createSourceFile(
    document.fileName,
    document.getText(),
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(document.fileName)
  )
}

function getScriptKind(fileName: string): TypeScript.ScriptKind {
  const extension = path.extname(fileName).toLowerCase()
  if (extension === ".tsx") {
    return ts.ScriptKind.TSX
  }
  if (extension === ".jsx") {
    return ts.ScriptKind.JSX
  }
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return ts.ScriptKind.JS
  }
  return ts.ScriptKind.TS
}

function findEnumAtOffset(
  sourceFile: TypeScript.SourceFile,
  offset: number
): TypeScript.EnumDeclaration | undefined {
  let found: TypeScript.EnumDeclaration | undefined

  const visit = (node: TypeScript.Node) => {
    if (found || offset < node.getFullStart() || offset > node.getEnd()) {
      return
    }
    if (
      ts.isEnumDeclaration(node) &&
      offset >= node.getStart(sourceFile) &&
      offset <= node.name.getEnd()
    ) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

function findEnumByIdentity(
  sourceFile: TypeScript.SourceFile,
  enumName: string,
  enumStart: number
): TypeScript.EnumDeclaration | undefined {
  let exact: TypeScript.EnumDeclaration | undefined
  let sameName: TypeScript.EnumDeclaration | undefined

  const visit = (node: TypeScript.Node) => {
    if (exact) {
      return
    }
    if (ts.isEnumDeclaration(node) && node.name.text === enumName) {
      if (node.getStart(sourceFile) === enumStart) {
        exact = node
        return
      }
      sameName ??= node
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return exact ?? sameName
}

function createMemberAccess(
  enumName: string,
  member: TypeScript.EnumMember,
  sourceFile: TypeScript.SourceFile
): string {
  if (ts.isIdentifier(member.name)) {
    return `${enumName}.${member.name.text}`
  }
  return `${enumName}[${member.name.getText(sourceFile)}]`
}

function getMemberComment(
  member: TypeScript.EnumMember,
  sourceFile: TypeScript.SourceFile
): string {
  const comments = (ts as any).getJSDocCommentsAndTags(member, sourceFile) as
    Array<{ comment?: unknown }> | undefined
  const comment = comments?.find((item) => item.comment !== undefined)?.comment
  if (typeof comment === "string") {
    return comment
  }
  if (Array.isArray(comment)) {
    return comment
      .map((part: any) => {
        if (typeof part === "string") {
          return part
        }
        return typeof part?.text === "string" ? part.text : (part?.getText?.(sourceFile) ?? "")
      })
      .join("")
  }
  return comment == null ? "" : String(comment)
}

function collectScopeValueBindings(declaration: TypeScript.EnumDeclaration): Set<string> {
  const names = new Set<string>()
  const parent = declaration.parent
  if (!(ts.isSourceFile(parent) || ts.isModuleBlock(parent) || ts.isBlock(parent))) {
    return names
  }

  parent.statements.forEach((statement) => {
    if (ts.isVariableStatement(statement)) {
      statement.declarationList.declarations.forEach((item) => collectBindingName(item.name, names))
      return
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isModuleDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text)
      return
    }
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const importClause = statement.importClause
      if (importClause.name) {
        names.add(importClause.name.text)
      }
      if (importClause.namedBindings) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          names.add(importClause.namedBindings.name.text)
        } else {
          importClause.namedBindings.elements.forEach((item) => names.add(item.name.text))
        }
      }
      return
    }
    if (ts.isImportEqualsDeclaration(statement)) {
      names.add(statement.name.text)
    }
  })

  return names
}

function collectBindingName(name: TypeScript.BindingName, names: Set<string>): void {
  if (ts.isIdentifier(name)) {
    names.add(name.text)
    return
  }
  name.elements.forEach((element) => {
    if (!ts.isOmittedExpression(element)) {
      collectBindingName(element.name, names)
    }
  })
}

function hasDeclareModifier(declaration: TypeScript.EnumDeclaration): boolean {
  return !!declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)
}

function isSupportedEnum(declaration: TypeScript.EnumDeclaration): boolean {
  return ts.isSourceFile(declaration.parent) || ts.isModuleBlock(declaration.parent)
}

function showAutoClosingInformationMessage(message: string, timeout = 2000): void {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: message,
      cancellable: false,
    },
    async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, timeout)
      })
    }
  )
}

function loadTypescriptModule(): typeof TypeScript {
  const tryRequire = (modulePath: string) => {
    try {
      if (modulePath === "typescript" || fs.existsSync(modulePath)) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require(modulePath)
      }
    } catch {
      // ignore
    }
    return undefined
  }

  const direct = tryRequire("typescript")
  if (direct) {
    return direct
  }

  const candidates: string[] = []
  const builtin = vscode.extensions.getExtension("vscode.typescript-language-features")
  if (builtin) {
    candidates.push(
      path.join(builtin.extensionPath, "node_modules", "typescript", "lib", "typescript.js")
    )
    candidates.push(path.join(builtin.extensionPath, "node_modules", "typescript", "typescript.js"))
  }

  const appRoot = (vscode.env as any)?.appRoot ?? ""
  if (appRoot) {
    candidates.push(
      path.join(appRoot, "extensions", "node_modules", "typescript", "lib", "typescript.js")
    )
    candidates.push(
      path.join(
        appRoot,
        "extensions",
        "typescript-language-features",
        "node_modules",
        "typescript",
        "lib",
        "typescript.js"
      )
    )
    candidates.push(
      path.join(
        appRoot,
        "resources",
        "app",
        "extensions",
        "node_modules",
        "typescript",
        "lib",
        "typescript.js"
      )
    )
  }

  for (const candidate of candidates) {
    const loaded = tryRequire(candidate)
    if (loaded) {
      return loaded
    }
  }

  const message =
    "无法加载 TypeScript 模块，枚举转换功能不可用。请确认插件依赖已安装，或 VSCode 的 TypeScript 扩展处于启用状态。"
  vscode.window.showErrorMessage(message)
  throw new Error(message)
}
