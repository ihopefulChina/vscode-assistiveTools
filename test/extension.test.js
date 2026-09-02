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
    lastEdit = { type: "insert", uri, position, text }
  }

  replace(uri, range, text) {
    lastEdit = { type: "replace", uri, range, text }
  }
}

class Range {
  constructor(start, end) {
    this.start = start
    this.end = end
  }
}

class CodeAction {
  constructor(title, kind) {
    this.title = title
    this.kind = kind
  }
}

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}

class ThemeIcon {
  constructor(id) {
    this.id = id
  }
}

class RelativePattern {
  constructor(base, pattern) {
    this.base = base
    this.pattern = pattern
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
    registerCodeActionsProvider() {
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
    getConfiguration() {
      return {
        get(_name, defaultValue) {
          return defaultValue
        },
      }
    },
    async openTextDocument(uri) {
      return documents.get(uri.toString())
    },
    async applyEdit() {
      return true
    },
    async findFiles() {
      return []
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
  Range,
  WorkspaceEdit,
  CodeAction,
  CodeActionKind: { RefactorRewrite: "refactor.rewrite" },
  TreeItem,
  ThemeIcon,
  RelativePattern,
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
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
const scriptsModule = require("../out/npm-scripts.js")
const wechatModule = require("../out/commands/wechat-pages.js")
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
  if (lastEdit.type === "replace") {
    const start = document.offsetAt(lastEdit.range.start)
    const end = document.offsetAt(lastEdit.range.end)
    return `${source.slice(0, start)}${lastEdit.text}${source.slice(end)}`
  }
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

test("enum conversion updates its generated block and preserves edited labels", async () => {
  resetState()
  const document = createDocument(
    [
      "enum EStatus {",
      "  /** Ready */",
      "  Ready = 1,",
      "  /** Done */",
      "  Done = 2,",
      "}",
      "",
      "// assistive-tools:enum EStatus:start",
      "export const MStatus = {",
      '  [EStatus.Ready]: "自定义待处理"',
      "}",
      "",
      "export const OStatus = [",
      '  { value: EStatus.Ready, label: "旧标签" }',
      "]",
      "// assistive-tools:enum EStatus:end",
      "",
    ].join("\n")
  )
  setActiveDocument(document, 0, 7)

  await enumCommand()

  assert.equal(lastEdit.type, "replace")
  const result = applyCapturedEdit(document)
  assert.match(result, /\[EStatus\.Ready\]: "自定义待处理"/)
  assert.match(result, /\[EStatus\.Done\]: "Done"/)
  assert.match(result, /value: EStatus\.Done/)
  assert.equal((result.match(/assistive-tools:enum EStatus:start/g) || []).length, 1)
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
  assert.equal(fs.existsSync(path.dirname(nested)), false)
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

test("template center discovers multiple templates and validates all output paths", (context) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-templates-"))
  const templateRoot = path.join(workspaceRoot, ".templates")
  fs.mkdirSync(templateRoot)
  context.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  fs.writeFileSync(
    path.join(templateRoot, "card-component.yml"),
    [
      'name: "Card"',
      'description: "Card component"',
      'tags: ["vue3", "card"]',
      'type: "component"',
      "tpl:",
      "  index.vue: |",
      "    <template />",
      "  styles/index.scss: |",
      "    .card {}",
      "",
    ].join("\n")
  )
  fs.writeFileSync(
    path.join(templateRoot, "unsafe-page.yml"),
    ['name: "Unsafe"', 'type: "page"', "tpl:", '  ../outside.ts: "bad"', ""].join("\n")
  )

  const templates = createModule.discoverCustomTemplates(workspaceRoot)
  assert.equal(templates.length, 2)
  assert.equal(templates[0].name, "Card")
  const errors = createModule.validateCustomTemplates(workspaceRoot)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /只能创建在目标文件夹内/)
})

test("script center always includes root package scripts", async (context) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-scripts-"))
  context.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  fs.writeFileSync(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({ name: "root-app", packageManager: "pnpm@10.0.0", scripts: { dev: "vite" } })
  )
  const folder = {
    name: "workspace",
    uri: { fsPath: workspaceRoot, toString: () => `file://${workspaceRoot}` },
  }

  const packages = await scriptsModule.discoverWorkspacePackages(folder)
  assert.equal(packages.length, 1)
  assert.equal(packages[0].isRoot, true)
  assert.equal(packages[0].scripts[0].name, "dev")
  assert.equal(packages[0].packageManager, "pnpm")
})

test("script center reads npm and pnpm workspace patterns and builds manager commands", () => {
  assert.deepEqual(
    scriptsModule.getWorkspacePatterns(
      { workspaces: ["apps/*", "!apps/legacy"] },
      "packages:\n  - 'packages/*'\n  - '!packages/old'\n"
    ),
    {
      include: ["apps/*", "packages/*"],
      exclude: ["apps/legacy", "packages/old"],
    }
  )
  assert.deepEqual(scriptsModule.buildScriptCommand("bun", "test"), {
    command: "bun",
    args: ["run", "test"],
  })
})

test("script center combines root scripts with workspace package scripts", async (context) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-monorepo-"))
  const childRoot = path.join(workspaceRoot, "packages", "web")
  const excludedRoot = path.join(workspaceRoot, "packages", "old")
  fs.mkdirSync(childRoot, { recursive: true })
  fs.mkdirSync(excludedRoot, { recursive: true })
  context.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  fs.writeFileSync(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({
      name: "root",
      workspaces: ["packages/*", "!packages/old"],
      scripts: { lint: "eslint ." },
    })
  )
  fs.writeFileSync(
    path.join(childRoot, "package.json"),
    JSON.stringify({ name: "web", scripts: { dev: "vite" } })
  )
  fs.writeFileSync(
    path.join(excludedRoot, "package.json"),
    JSON.stringify({ name: "old", scripts: { dev: "vite" } })
  )
  const originalFindFiles = vscode.workspace.findFiles
  vscode.workspace.findFiles = async () => [
    vscode.Uri.file(path.join(childRoot, "package.json")),
    vscode.Uri.file(path.join(excludedRoot, "package.json")),
  ]
  context.after(() => {
    vscode.workspace.findFiles = originalFindFiles
  })

  const packages = await scriptsModule.discoverWorkspacePackages({
    name: "workspace",
    uri: { fsPath: workspaceRoot, toString: () => `file://${workspaceRoot}` },
  })
  assert.equal(packages.length, 2)
  assert.equal(packages[0].isRoot, true)
  assert.equal(packages[0].scripts[0].name, "lint")
  assert.equal(packages[1].packageName, "web")
  assert.equal(packages[1].scripts[0].name, "dev")
})

test("wechat page sync parses root and subpackage pages and preserves debug metadata", () => {
  const pages = wechatModule.parseMiniProgramPages(
    [
      "export default defineAppConfig({",
      "  pages: [",
      "    /** 首页 */",
      "    'pages/home/index',",
      "  ],",
      "  subPackages: [{",
      "    root: 'packages/member',",
      "    pages: ['detail/index'],",
      "  }],",
      "})",
    ].join("\n")
  )
  assert.deepEqual(
    pages.map((item) => item.path),
    ["pages/home/index", "packages/member/detail/index"]
  )

  const merged = wechatModule.mergeMiniProgramConditions(
    {
      condition: {
        miniprogram: {
          list: [
            {
              name: "手工首页",
              pathName: "pages/home/index",
              query: "id=1",
              scene: 1001,
              launchMode: "default",
            },
          ],
        },
      },
    },
    pages
  )
  assert.equal(merged.added, 1)
  assert.equal(merged.config.condition.miniprogram.list[0].name, "手工首页")
  assert.equal(merged.config.condition.miniprogram.list[0].query, "id=1")
})

test("wechat page sync targets the nearest mini-program package in a monorepo", (context) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-wechat-root-"))
  const projectRoot = path.join(workspaceRoot, "packages", "mini-app")
  const sourcePath = path.join(projectRoot, "src", "app.config.ts")
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
  fs.writeFileSync(path.join(workspaceRoot, "package.json"), JSON.stringify({ private: true }))
  fs.writeFileSync(path.join(projectRoot, "package.json"), JSON.stringify({ name: "mini-app" }))
  fs.writeFileSync(path.join(projectRoot, "project.config.json"), "{}")
  context.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  assert.equal(wechatModule.findMiniProgramProjectRoot(sourcePath, workspaceRoot), projectRoot)
})
