import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import type * as TypeScript from "typescript"

const ts: typeof TypeScript = loadTypescriptModule()

const ENUM_DOCUMENT_SELECTOR: vscode.DocumentSelector = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
].flatMap((language) => [
  { language, scheme: "file" },
  { language, scheme: "untitled" },
])

type EnumCommandArgument = {
  sourceUri: string
  enumName: string
  enumStart: number
}

type EnumChild = {
  access: string
  comment: string
}

type EnumOutputMode = "both" | "map" | "options"

type ExistingGeneratedBlock = {
  start: number
  end: number
  labels: Map<string, string>
  recognizedNames: Set<string>
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
  existing?: ExistingGeneratedBlock
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
    const markdownString = new vscode.MarkdownString(`[生成或更新枚举转换](${commandUri})`)
    markdownString.isTrusted = true
    return new vscode.Hover(markdownString)
  }
}

class EnumCodeActionProvider implements vscode.CodeActionProvider {
  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.CodeAction[] | undefined {
    const target = getEnumTarget(document, range.start)
    if (!target) {
      return undefined
    }
    const action = new vscode.CodeAction(
      "Assistive Tools：生成或更新枚举 Map/Options",
      vscode.CodeActionKind.RefactorRewrite
    )
    action.command = {
      command: "assistiveTools.convertEnum",
      title: action.title,
      arguments: [target],
    }
    return [action]
  }
}

/**
 * 注册鼠标悬停提示和枚举转换命令
 */
export default function registerEnumHover(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ENUM_DOCUMENT_SELECTOR,
      new HoverProvider()
    )
  )

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ENUM_DOCUMENT_SELECTOR,
      new EnumCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite] }
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

        const configuration = vscode.workspace.getConfiguration("assistiveTools.enum")
        const outputMode = configuration.get<EnumOutputMode>("output", "both")
        const useSatisfies = configuration.get<boolean>("useSatisfies", false)
        const relevantCollisions = result.collisions.filter((name) => {
          if (outputMode === "map") {
            return name === result.nameMap.mapName
          }
          if (outputMode === "options") {
            return name === result.nameMap.optionName
          }
          return true
        })
        if (relevantCollisions.length > 0) {
          return showAutoClosingInformationMessage(
            `存在无法安全覆盖的同名变量：${relevantCollisions.join("、")}`
          )
        }

        const generated = renderEnumConversion(document, result, outputMode, useSatisfies)
        const edit = new vscode.WorkspaceEdit()
        if (result.existing) {
          edit.replace(
            document.uri,
            new vscode.Range(
              document.positionAt(result.existing.start),
              document.positionAt(result.existing.end)
            ),
            generated
          )
        } else {
          edit.insert(
            document.uri,
            document.positionAt(result.declaration.getEnd()),
            `\n\n${generated}`
          )
        }

        const applied = await vscode.workspace.applyEdit(edit)
        if (!applied) {
          vscode.window.showErrorMessage("生成失败：编辑器未能应用代码变更")
          return
        }

        showAutoClosingInformationMessage(result.existing ? "更新成功" : "生成成功", 300)
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
  const existing = findExistingGeneratedBlock(sourceFile, declaration, nameMap)
  const bindings = collectScopeValueBindings(declaration)
  const collisions = [nameMap.mapName, nameMap.optionName].filter(
    (name) => bindings.has(name) && !existing?.recognizedNames.has(name)
  )
  const children = declaration.members.map((member) => {
    const access = createMemberAccess(declaration.name.text, member, sourceFile)
    return {
      access,
      comment: existing?.labels.get(normalizeMemberAccess(access)) ?? getMemberComment(member, sourceFile),
    }
  })

  return {
    declaration,
    sourceFile,
    nameMap,
    children,
    collisions,
    existing,
  }
}

function renderEnumConversion(
  document: vscode.TextDocument,
  result: EnumParseResult,
  outputMode: EnumOutputMode,
  useSatisfies: boolean
): string {
  const startLine = document.positionAt(result.declaration.getStart(result.sourceFile)).line
  const indent = document.lineAt(startLine).text.match(/^\s*/)?.[0] ?? ""
  const exportPrefix =
    ts.isSourceFile(result.declaration.parent) || ts.isModuleBlock(result.declaration.parent)
      ? "export "
      : ""

  const lines: string[] = [`// assistive-tools:enum ${result.nameMap.name}:start`]
  if (outputMode === "both" || outputMode === "map") {
    lines.push(`${exportPrefix}const ${result.nameMap.mapName} = {`)
    result.children.forEach((item, index) => {
      lines.push(
        `  [${item.access}]: ${JSON.stringify(item.comment)}${
          index < result.children.length - 1 ? "," : ""
        }`
      )
    })
    lines.push(useSatisfies ? `} satisfies Record<${result.nameMap.name}, string>` : "}")
  }

  if (outputMode === "both") {
    lines.push("")
  }

  if (outputMode === "both" || outputMode === "options") {
    lines.push(`${exportPrefix}const ${result.nameMap.optionName} = [`)
    result.children.forEach((item, index) => {
      lines.push(
        `  { value: ${item.access}, label: ${JSON.stringify(item.comment)} }${
          index < result.children.length - 1 ? "," : ""
        }`
      )
    })
    lines.push("]")
  }
  lines.push(`// assistive-tools:enum ${result.nameMap.name}:end`)

  return lines.map((line) => (line ? `${indent}${line}` : "")).join("\n")
}

function findExistingGeneratedBlock(
  sourceFile: TypeScript.SourceFile,
  declaration: TypeScript.EnumDeclaration,
  nameMap: EnumNameMap
): ExistingGeneratedBlock | undefined {
  const source = sourceFile.getFullText()
  const markerStart = `// assistive-tools:enum ${nameMap.name}:start`
  const markerEnd = `// assistive-tools:enum ${nameMap.name}:end`
  const markerStartIndex = source.indexOf(markerStart, declaration.getEnd())
  const markerEndIndex =
    markerStartIndex >= 0 ? source.indexOf(markerEnd, markerStartIndex + markerStart.length) : -1
  const mapBinding = findVariableBinding(declaration, nameMap.mapName)
  const optionBinding = findVariableBinding(declaration, nameMap.optionName)

  if (markerStartIndex >= 0 && markerEndIndex >= 0) {
    const isInsideMarker = (
      binding:
        | { statement: TypeScript.VariableStatement; declaration: TypeScript.VariableDeclaration }
        | undefined
    ) =>
      !!binding &&
      binding.statement.getStart(sourceFile) > markerStartIndex &&
      binding.statement.getEnd() < markerEndIndex
    const markedMap = isInsideMarker(mapBinding) ? mapBinding : undefined
    const markedOptions = isInsideMarker(optionBinding) ? optionBinding : undefined
    const recognizedNames = new Set<string>()
    if (markedMap) recognizedNames.add(nameMap.mapName)
    if (markedOptions) recognizedNames.add(nameMap.optionName)
    return {
      start: lineStartOffset(source, markerStartIndex),
      end: markerEndIndex + markerEnd.length,
      labels: collectExistingLabels(
        sourceFile,
        markedMap?.declaration,
        markedOptions?.declaration
      ),
      recognizedNames,
    }
  }

  if (!mapBinding || !optionBinding) {
    return undefined
  }
  const bindings = [mapBinding, optionBinding].sort(
    (left, right) => left.statement.getStart(sourceFile) - right.statement.getStart(sourceFile)
  )
  const firstStart = bindings[0].statement.getStart(sourceFile)
  const firstEnd = bindings[0].statement.getEnd()
  const secondStart = bindings[1].statement.getStart(sourceFile)
  if (
    source.slice(declaration.getEnd(), firstStart).trim() !== "" ||
    source.slice(firstEnd, secondStart).trim() !== ""
  ) {
    return undefined
  }

  return {
    start: lineStartOffset(source, firstStart),
    end: bindings[1].statement.getEnd(),
    labels: collectExistingLabels(sourceFile, mapBinding.declaration, optionBinding.declaration),
    recognizedNames: new Set([nameMap.mapName, nameMap.optionName]),
  }
}

function lineStartOffset(source: string, offset: number): number {
  const previousBreak = source.lastIndexOf("\n", offset - 1)
  return previousBreak < 0 ? 0 : previousBreak + 1
}

function findVariableBinding(
  declaration: TypeScript.EnumDeclaration,
  name: string
): { statement: TypeScript.VariableStatement; declaration: TypeScript.VariableDeclaration } | undefined {
  const parent = declaration.parent
  if (!(ts.isSourceFile(parent) || ts.isModuleBlock(parent))) {
    return undefined
  }
  for (const statement of parent.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue
    }
    for (const variable of statement.declarationList.declarations) {
      if (ts.isIdentifier(variable.name) && variable.name.text === name) {
        return { statement, declaration: variable }
      }
    }
  }
  return undefined
}

function collectExistingLabels(
  sourceFile: TypeScript.SourceFile,
  mapDeclaration?: TypeScript.VariableDeclaration,
  optionDeclaration?: TypeScript.VariableDeclaration
): Map<string, string> {
  const labels = new Map<string, string>()
  if (mapDeclaration?.initializer && ts.isObjectLiteralExpression(mapDeclaration.initializer)) {
    for (const property of mapDeclaration.initializer.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        ts.isComputedPropertyName(property.name) &&
        isStringLiteralLike(property.initializer)
      ) {
        labels.set(
          normalizeMemberAccess(property.name.expression.getText(sourceFile)),
          property.initializer.text
        )
      }
    }
  }

  if (optionDeclaration?.initializer && ts.isArrayLiteralExpression(optionDeclaration.initializer)) {
    for (const element of optionDeclaration.initializer.elements) {
      if (!ts.isObjectLiteralExpression(element)) {
        continue
      }
      const valueProperty = element.properties.find(
        (property): property is TypeScript.PropertyAssignment =>
          ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === "value"
      )
      const labelProperty = element.properties.find(
        (property): property is TypeScript.PropertyAssignment =>
          ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === "label"
      )
      if (valueProperty && labelProperty && isStringLiteralLike(labelProperty.initializer)) {
        const key = normalizeMemberAccess(valueProperty.initializer.getText(sourceFile))
        if (!labels.has(key)) {
          labels.set(key, labelProperty.initializer.text)
        }
      }
    }
  }
  return labels
}

function isStringLiteralLike(
  node: TypeScript.Expression
): node is TypeScript.StringLiteral | TypeScript.NoSubstitutionTemplateLiteral {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
}

function normalizeMemberAccess(access: string): string {
  return access.replace(/\s+/g, "")
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
