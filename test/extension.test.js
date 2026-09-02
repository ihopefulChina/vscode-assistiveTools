const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const Module = require("node:module")
const typescript = require("typescript")

let enumCommand
let hoverProvider
let lastEdit
let notices = []
const documents = new Map()

class Position {
  constructor(line, character) {
    this.line = line
    this.character = character
  }
}

class WorkspaceEdit {
  insert(uri, position, text) {
    lastEdit = { uri, position, text }
  }
}

class MarkdownString {
  constructor(value) {
    this.value = value
    this.isTrusted = false
  }
}

class Hover {
  constructor(contents) {
    this.contents = contents
  }
}

const vscode = {
  languages: {
    registerHoverProvider(_selectors, provider) {
      hoverProvider = provider
      return { dispose() {} }
    },
  },
  commands: {
    registerCommand(name, callback) {
      if (name === "assistiveTools.convertEnum") {
        enumCommand = callback
      }
      return { dispose() {} }
    },
  },
  workspace: {
    workspaceFolders: undefined,
    getWorkspaceFolder() {
      return undefined
    },
    async openTextDocument(uri) {
      return documents.get(uri.toString())
    },
    async applyEdit() {
      return true
    },
  },
  window: {
    activeTextEditor: undefined,
    withProgress(options) {
      notices.push(options.title)
    },
    showErrorMessage(message) {
      notices.push(message)
    },
  },
  ProgressLocation: { Notification: 1 },
  Position,
  WorkspaceEdit,
  MarkdownString,
  Hover,
  Uri: {
    parse(value) {
      return { toString: () => value, fsPath: value.replace(/^file:\/\//, "") }
    },
    file(value) {
      return { toString: () => `file://${value}`, fsPath: value }
    },
  },
  extensions: { getExtension() {} },
  env: {},
}

const originalLoad = Module._load
Module._load = function load(request, parent, isMain) {
  if (request === "vscode") {
    return vscode
  }
  return originalLoad.call(this, request, parent, isMain)
}

const enumModule = require("../out/commands/enum-hover.js")
const createModule = require("../out/commands/create-components.js")
enumModule.default({ subscriptions: [] })
Module._load = originalLoad

function createDocument(source, fileName = "/workspace/example.ts") {
  const uri = vscode.Uri.file(fileName)
  const lines = source.split("\n")
  const document = {
    fileName,
    uri,
    getText() {
      return source
    },
    lineAt(line) {
      return { text: lines[line] ?? "" }
    },
    offsetAt(position) {
      let offset = 0
      for (let line = 0; line < position.line; line += 1) {
        offset += lines[line].length + 1
      }
      return offset + position.character
    },
    positionAt(offset) {
      const before = source.slice(0, offset).split("\n")
      return new Position(before.length - 1, before[before.length - 1].length)
    },
  }
  documents.set(uri.toString(), document)
  return document
}

function setActiveDocument(document, line, character) {
  vscode.window.activeTextEditor = {
    document,
    selection: { active: new Position(line, character) },
  }
}

function applyCapturedEdit(document) {
  const source = document.getText()
  const offset = document.offsetAt(lastEdit.position)
  return `${source.slice(0, offset)}${lastEdit.text}${source.slice(offset)}`
}

function resetState() {
  lastEdit = undefined
  notices = []
  vscode.window.activeTextEditor = undefined
}

test("enum names support both E-prefixed and ordinary names", () => {
  assert.deepEqual(enumModule.deriveEnumNames("EStatus"), {
    name: "EStatus",
    mapName: "MStatus",
    optionName: "OStatus",
  })
  assert.deepEqual(enumModule.deriveEnumNames("Status"), {
    name: "Status",
    mapName: "MStatus",
    optionName: "OStatus",
  })
})

test("hover ignores enum-like text in comments", () => {
  resetState()
  const document = createDocument("// enum EGhost is documentation\nexport const live = true\n")
  assert.equal(hoverProvider.provideHover(document, new Position(0, 5)), undefined)
})

test("enum conversion inserts immediately after the enum", async () => {
  resetState()
  const document = createDocument(
    [
      "enum EStatus {",
      "  /** Ready */",
      "  Ready = 1,",
      "}",
      "const next = {",
      "  ok: true,",
      "}",
      "",
    ].join("\n")
  )
  setActiveDocument(document, 0, 7)

  await enumCommand()

  const result = applyCapturedEdit(document)
  assert.ok(result.indexOf("export const MStatus") < result.indexOf("const next"))
  assert.equal(
    typescript.createSourceFile("result.ts", result, typescript.ScriptTarget.Latest, true)
      .parseDiagnostics.length,
    0
  )
})

test("enum conversion safely emits string members and apostrophes", async () => {
  resetState()
  const document = createDocument(
    ["enum EState {", "  /** User's value */", '  "in-progress" = "p",', "}", ""].join("\n")
  )
  setActiveDocument(document, 0, 7)

  await enumCommand()

  const result = applyCapturedEdit(document)
  assert.match(result, /EState\["in-progress"\]/)
  assert.match(result, /"User's value"/)
  assert.equal(
    typescript.createSourceFile("result.ts", result, typescript.ScriptTarget.Latest, true)
      .parseDiagnostics.length,
    0
  )
})

test("ordinary enum names are not blocked by similarly prefixed type names", async () => {
  resetState()
  const document = createDocument(
    ["enum Status {", "  Ready = 1,", "}", "type MStatusProps = { value: number }", ""].join("\n")
  )
  setActiveDocument(document, 0, 6)

  await enumCommand()

  assert.match(lastEdit.text, /export const MStatus/)
  assert.match(lastEdit.text, /export const OStatus/)
})

test("command palette invocation without an active enum does not throw", async () => {
  resetState()
  await enumCommand()
  assert.match(notices.join("\n"), /请先打开/)
})

test("template variable conversion preserves word boundaries", () => {
  const output = createModule.replaceTemplateVariables(
    "${pascalName}|${camelName}|${kebabName}",
    "MyComponent",
    "component"
  )
  assert.equal(output, "MyComponent|myComponent|my-component")
})

test("plain Vite React projects are not detected as Vue", (context) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-vite-"))
  context.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  fs.writeFileSync(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({ dependencies: { vite: "^7.0.0", react: "^19.0.0" } })
  )
  fs.writeFileSync(path.join(workspaceRoot, "vite.config.ts"), "export default {}")

  assert.equal(createModule.detectProjectType(workspaceRoot), null)
})

test("multi-root operations use the workspace containing the selected directory", () => {
  vscode.workspace.workspaceFolders = [{ uri: { fsPath: "/workspace/first" } }]
  vscode.workspace.getWorkspaceFolder = () => ({ uri: { fsPath: "/workspace/second" } })

  assert.equal(createModule.getWorkspaceRoot("/workspace/second/src"), "/workspace/second")

  vscode.workspace.workspaceFolders = undefined
  vscode.workspace.getWorkspaceFolder = () => undefined
})

test("template outputs stay inside the generated folder and support nested files", (context) => {
  const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-output-"))
  context.after(() => fs.rmSync(folderPath, { recursive: true, force: true }))

  assert.throws(
    () => createModule.resolveTemplateOutputPath(folderPath, "../outside.ts"),
    /只能创建在目标文件夹内/
  )
  const nested = createModule.resolveTemplateOutputPath(folderPath, "styles/index.scss")
  assert.equal(nested, path.join(folderPath, "styles", "index.scss"))
  assert.ok(fs.statSync(path.dirname(nested)).isDirectory())
})

test("template outputs cannot escape through a nested symbolic link", (context) => {
  const folderPath = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-link-root-"))
  const outsidePath = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-link-outside-"))
  context.after(() => {
    fs.rmSync(folderPath, { recursive: true, force: true })
    fs.rmSync(outsidePath, { recursive: true, force: true })
  })
  fs.symlinkSync(outsidePath, path.join(folderPath, "linked"), "dir")

  assert.throws(
    () => createModule.resolveTemplateOutputPath(folderPath, "linked/index.ts"),
    /不能通过符号链接/
  )
})
