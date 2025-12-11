import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import type * as TypeScript from "typescript"

const ts: typeof TypeScript = loadTypescriptModule()

type Argument = {
  /** 文件路径 */
  sourcePath: string
  /** 当前行文本 */
  text: string
}

type EnumChild = {
  name: string
  comment: string
}

type EnumParseResult = {
  /** 是否已经生成过 */
  hasGenerate: boolean
  /** 枚举对象结束行 */
  endLine: number
  /** 枚举项与注释 */
  children: EnumChild[]
}

type EnumNameMap = {
  name: string
  mapName: string
  optionName: string
}

/**
 * 枚举悬停转换
 */
class HoverProvider implements vscode.HoverProvider {
  public provideHover(document: vscode.TextDocument, position: vscode.Position) {
    const fileName = document.fileName
    const line = document.lineAt(position)

    // 判断悬浮文本是否是枚举
    if (!/enum [a-zA-Z_0-9]+/.test(line.text)) {
      return
    }

    // 赋值命令
    const args: Argument[] = [
      {
        sourcePath: fileName,
        text: line.text,
      },
    ]
    const stageCommandUri = vscode.Uri.parse(
      `command:assistiveTools.convertEnum?${encodeURIComponent(JSON.stringify(args))}`
    )
    const markdownString = new vscode.MarkdownString(`[生成枚举转换](${stageCommandUri})`)
    markdownString.isTrusted = true
    return new vscode.Hover(markdownString)
  }
}

/**
 * 注册鼠标悬停提示
 */
export default function registerEnumHover(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      ["typescript", "typescriptreact", "javascript", "javascriptreact"],
      new HoverProvider()
    )
  )

  // 注册vscode命令
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "assistiveTools.convertEnum",
      async ({ sourcePath, text }: Argument) => {
        // 获取line text中的枚举名称
        const enumMatch = text.match(/enum [a-zA-Z_0-9]+/)
        if (!enumMatch) {
          return showAutoClosingInformationMessage("未找到枚举定义")
        }

        const enumName = enumMatch[0].replace(/enum( )?/, "")

        const nameMap: EnumNameMap = {
          name: enumName,
          mapName: enumName.replace(/^E/, "M"),
          optionName: enumName.replace(/^E/, "O"),
        }

        const document = await vscode.workspace.openTextDocument(sourcePath) // 创建文档对象
        const result = parseEnumObjects(document, nameMap)
        const edit = new vscode.WorkspaceEdit()

        // 判断是否生成过
        if (result.hasGenerate) {
          return showAutoClosingInformationMessage(`转换代码已存在。如需重新生成，请删除原有代码`)
        }

        // 生成文本
        const insertText: string[] = []
        insertText.push(`export const ${nameMap.mapName} = {`)
        result.children.forEach((item, index) => {
          insertText.push(
            `  [${enumName}.${item.name}]: '${item.comment}'${
              index < result.children.length - 1 ? "," : ""
            }`
          )
        })
        insertText.push(`}\n`)
        insertText.push(`export const ${nameMap.optionName} = [`)
        result.children.forEach((item, index) => {
          insertText.push(
            `  { value: ${enumName}.${item.name}, label: '${item.comment}' }${
              index < result.children.length - 1 ? "," : ""
            }`
          )
        })
        insertText.push(`]\n`)

        // 往指定行插入文本
        const startPos = new vscode.Position(result.endLine, 0)
        edit.insert(document.uri, startPos, insertText.join("\n"))
        await vscode.workspace.applyEdit(edit)

        showAutoClosingInformationMessage(`生成成功`, 300)
      }
    )
  )
}

/**
 * 解析枚举对象
 * @param document
 * @param enumName
 * @returns
 */
function parseEnumObjects(document: vscode.TextDocument, enumName: EnumNameMap): EnumParseResult {
  const sourceCode = document.getText()
  const sourceFile = ts.createSourceFile("temp.ts", sourceCode, ts.ScriptTarget.Latest, true)

  const enumObj: EnumParseResult = {
    /** 是否已经生成过 */
    hasGenerate: false,
    /** 枚举对象结束行 */
    endLine: 0,
    /** 枚举项与注释 */
    children: [],
  }

  if (sourceCode.match(new RegExp(`${enumName.mapName}|${enumName.optionName}`, "gm"))) {
    enumObj.hasGenerate = true
    return enumObj
  }

  // 遍历 AST，查找枚举对象
  ts.forEachChild(sourceFile, (node: TypeScript.Node) => {
    // 查询对应枚举 并生成数据
    if (ts.isEnumDeclaration(node)) {
      // 在这里可以处理枚举对象
      if (node.name.text !== enumName.name) {
        return
      }

      // 获取枚举对象的结束位置
      const endPos = node.getEnd()
      const endLine = document.positionAt(endPos).line
      enumObj.endLine = endLine + 2

      // 遍历枚举成员
      node.members.forEach((member: TypeScript.EnumMember) => {
        if (ts.isEnumMember(member)) {
          const memberName = (member.name as TypeScript.Identifier).text
          // 获取枚举项的注释
          const comments = (ts as any).getJSDocCommentsAndTags(member, sourceFile)
          const commentText = comments?.[0]?.comment || ""
          enumObj.children.push({
            name: memberName,
            comment: commentText,
          })
        }
      })
    }
  })

  return enumObj
}

function showAutoClosingInformationMessage(message: string, timeout = 2000): void {
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: message,
      cancellable: false,
    },
    async (_progress: vscode.Progress<{ message?: string; increment?: number }>) => {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve()
        }, timeout)
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
