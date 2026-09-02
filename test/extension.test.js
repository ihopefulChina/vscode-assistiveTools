const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const Module = require("node:module")
const { execFileSync } = require("node:child_process")
const typescript = require("typescript")
const yaml = require("js-yaml")

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
const workflowModule = require("../out/workflow.js")
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

test("Taro page creation detects the nearest monorepo package and provides two output files", (context) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-taro-monorepo-"))
  const packageRoot = path.join(workspaceRoot, "packages", "mini-app")
  const pagesRoot = path.join(packageRoot, "src", "pages")
  fs.mkdirSync(pagesRoot, { recursive: true })
  context.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  fs.writeFileSync(path.join(workspaceRoot, "package.json"), JSON.stringify({ private: true }))
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ dependencies: { "@tarojs/taro": "^4.2.1" } })
  )

  const detectedRoot = createModule.findNearestPackageRoot(pagesRoot, workspaceRoot)
  assert.equal(detectedRoot, packageRoot)
  assert.equal(createModule.detectProjectType(detectedRoot), "taro")
  assert.deepEqual(createModule.deriveTemplateNames("OrderDetail"), {
    pascalName: "OrderDetail",
    camelName: "orderDetail",
    kebabName: "order-detail",
  })

  const template = yaml.load(
    fs.readFileSync(
      path.join(__dirname, "..", "resources", "templates", "taro", "page.yml"),
      "utf8"
    )
  )
  assert.deepEqual(Object.keys(template.tpl), ["index.tsx", "index.module.less"])
  assert.match(
    createModule.replaceTemplateVariables(template.tpl["index.tsx"], "OrderDetail", "page"),
    /styles\.orderDetailStyle/
  )
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

test("script center discovers multiple single-level and nested workspaces", async (context) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-monorepo-"))
  const directories = ["apps/admin", "packages/ui-kit", "tools/domain/codegen"]
  for (const directory of directories) {
    const absolute = path.join(workspaceRoot, directory)
    fs.mkdirSync(absolute, { recursive: true })
    fs.writeFileSync(
      path.join(absolute, "package.json"),
      JSON.stringify({ name: directory, scripts: { typecheck: "tsc --noEmit" } })
    )
  }
  fs.writeFileSync(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({ name: "root", scripts: { format: "prettier --check ." } })
  )
  fs.writeFileSync(
    path.join(workspaceRoot, "pnpm-workspace.yaml"),
    "packages:\n  - 'apps/*'\n  - 'packages/*'\n  - 'tools/**/**'\n"
  )
  context.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))

  const originalFindFiles = vscode.workspace.findFiles
  vscode.workspace.findFiles = async (include) => {
    const packagePathByPattern = {
      "apps/*/package.json": "apps/admin/package.json",
      "packages/*/package.json": "packages/ui-kit/package.json",
      "tools/**/**/package.json": "tools/domain/codegen/package.json",
    }
    const relative = packagePathByPattern[include.pattern]
    return relative ? [vscode.Uri.file(path.join(workspaceRoot, relative))] : []
  }
  context.after(() => {
    vscode.workspace.findFiles = originalFindFiles
  })

  const packages = await scriptsModule.discoverWorkspacePackages({
    name: "sample-monorepo",
    uri: { fsPath: workspaceRoot, toString: () => `file://${workspaceRoot}` },
  })
  assert.deepEqual(
    packages.map((item) => item.relativeDirectory),
    ["", "apps/admin", "packages/ui-kit", "tools/domain/codegen"]
  )
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

function createWorkflowConfig() {
  return workflowModule.parseWorkflowConfig(`
version: 1
changes:
  baseRef: origin/main
checks:
  - id: test
    name: 单元测试
    command: npm test
    paths: [src/**, test/**]
    exclude: [src/generated/**]
    required: true
generated:
  - id: api
    name: API 客户端
    sources: [openapi/**]
    outputs: [src/generated/**]
    command: npm run generate:api
    required: true
release:
  requireCleanWorkingTree: true
  requiredChecks: [test]
  artifacts: [dist/*.vsix]
  reportPath: .assistive-tools/release-readiness.md
`)
}

function createSnapshot(overrides = {}) {
  return {
    branch: "feature/workflow",
    commit: "1234567890abcdef",
    base: "abcdef1234567890",
    files: [],
    workingFiles: [],
    clean: true,
    signature: "change-signature",
    ...overrides,
  }
}

test("workflow config validates ids, generated rules, references and report paths", () => {
  const config = createWorkflowConfig()
  assert.equal(config.version, 1)
  assert.equal(config.checks[0].required, true)
  assert.equal(config.generated[0].outputs[0], "src/generated/**")

  const noRequiredChecks = workflowModule.parseWorkflowConfig(`
version: 1
checks:
  - id: test
    command: npm test
release:
  requiredChecks: []
`)
  assert.deepEqual(noRequiredChecks.release.requiredChecks, [])

  assert.throws(
    () =>
      workflowModule.parseWorkflowConfig(`
version: 1
checks:
  - id: bad/id
    command: ""
generated:
  - id: api
    sources: []
    outputs: []
    command: generate
release:
  requiredChecks: [missing]
  reportPath: ../outside.md
`),
    /id 格式无效|command 不能为空|sources 不能为空|reportPath/
  )
  assert.throws(
    () =>
      workflowModule.parseWorkflowConfig(`
version: 1
release:
  reportPath: .
`),
    /reportPath/
  )
})

test("workflow reports cannot write through a workspace symlink", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-report-root-"))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-report-outside-"))
  fs.symlinkSync(outside, path.join(root, "reports"), "dir")
  context.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })

  assert.throws(
    () => workflowModule.resolveWorkspaceOutputPath(root, "reports/release.md"),
    /符号链接/
  )
})

test("workflow glob matching handles root files, nested files, stars and question marks", () => {
  assert.equal(workflowModule.matchesGlob("src/index.ts", "src/**"), true)
  assert.equal(workflowModule.matchesGlob("src/pages/home/index.tsx", "**/*.tsx"), true)
  assert.equal(workflowModule.matchesGlob("package-lock.json", "package*.json"), true)
  assert.equal(workflowModule.matchesGlob("src/a.ts", "src/?.ts"), true)
  assert.equal(workflowModule.matchesGlob("test/a.ts", "src/**"), false)
})

test("workflow recommends generators before checks and respects excluded paths", () => {
  const config = createWorkflowConfig()
  const actions = workflowModule.recommendWorkflowActions(config, [
    "openapi/order.yml",
    "src/generated/client.ts",
    "src/order/service.ts",
  ])
  assert.deepEqual(
    actions.map((item) => item.id),
    ["generated:api", "check:test"]
  )

  const generatedOnly = workflowModule.recommendWorkflowActions(config, ["src/generated/client.ts"])
  assert.deepEqual(
    generatedOnly.map((item) => item.id),
    ["generated:api"]
  )
})

test("release matrix blocks direct generated output edits and stale validations", () => {
  const config = createWorkflowConfig()
  const snapshot = createSnapshot({
    files: ["src/generated/client.ts"],
    workingFiles: ["src/generated/client.ts"],
    clean: false,
  })
  const matrix = workflowModule.buildReleaseMatrix(config, snapshot, {}, { "dist/*.vsix": 1 })
  const generated = matrix.find((row) => row.item === "生成物：API 客户端")
  assert.equal(generated.status, "BLOCKED")
  assert.match(generated.detail, /直接修改/)
  assert.equal(matrix.find((row) => row.item === "Git 工作区").status, "BLOCKED")

  const generatedResult = {
    id: "generated:api",
    label: "API 客户端",
    command: "npm run generate:api",
    passed: true,
    exitCode: 0,
    completedAt: "2026-09-02T00:00:00.000Z",
    signature: snapshot.signature,
  }
  const verified = workflowModule.buildReleaseMatrix(
    config,
    snapshot,
    { "generated:api": generatedResult },
    { "dist/*.vsix": 1 }
  )
  assert.equal(verified.find((row) => row.item === "生成物：API 客户端").status, "PASS")
})

test("release matrix becomes ready only with current successful results and artifacts", () => {
  const config = createWorkflowConfig()
  const snapshot = createSnapshot({ files: ["openapi/order.yml", "src/order/service.ts"] })
  const result = (id) => ({
    id,
    label: id,
    command: "ok",
    passed: true,
    exitCode: 0,
    completedAt: "2026-09-02T00:00:00.000Z",
    signature: snapshot.signature,
  })
  const results = {
    "generated:api": result("generated:api"),
    "check:test": result("check:test"),
  }
  const matrix = workflowModule.buildReleaseMatrix(config, snapshot, results, { "dist/*.vsix": 1 })
  assert.equal(
    matrix.every((row) => row.status === "PASS"),
    true
  )

  results["check:test"].signature = "old-signature"
  const stale = workflowModule.buildReleaseMatrix(config, snapshot, results, { "dist/*.vsix": 1 })
  assert.equal(stale.find((row) => row.item === "验证：单元测试").status, "PENDING")
})

test("release report contains matrix, changed scope and recommended commands", () => {
  const config = createWorkflowConfig()
  const snapshot = createSnapshot({ files: ["src/order/service.ts"] })
  const actions = workflowModule.recommendWorkflowActions(config, snapshot.files)
  const matrix = workflowModule.buildReleaseMatrix(config, snapshot, {}, { "dist/*.vsix": 0 })
  const report = workflowModule.renderReleaseReport(
    {
      configPath: "/workspace/.assistive-tools/workflow.yml",
      config,
      snapshot,
      actions,
      results: {},
      artifactCounts: { "dist/*.vsix": 0 },
      matrix,
      ready: false,
    },
    new Date("2026-09-02T00:00:00.000Z")
  )
  assert.match(report, /NOT READY/)
  assert.match(report, /src\/order\/service\.ts/)
  assert.match(report, /npm test/)
  assert.match(report, /发布物：dist\/\*\.vsix/)
})

test("default workflow config reuses scripts from the root package", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-workflow-"))
  context.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      packageManager: "pnpm@10.0.0",
      scripts: { lint: "eslint .", test: "node --test" },
    })
  )
  const generated = workflowModule.buildDefaultWorkflowYaml(root)
  const parsed = workflowModule.parseWorkflowConfig(generated)
  assert.deepEqual(
    parsed.checks.map((item) => item.id),
    ["lint", "test"]
  )
  assert.equal(parsed.checks[0].command, 'pnpm run "lint"')
  assert.equal(parsed.changes.baseRef, undefined)
})

test("git workflow snapshot includes branch and untracked changes but ignores its report", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-git-snapshot-"))
  context.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" })
  git("init", "-q")
  git("config", "user.name", "Assistive Test")
  git("config", "user.email", "assistive@example.com")
  fs.mkdirSync(path.join(root, "src"))
  fs.writeFileSync(path.join(root, "src", "base.ts"), "export const base = true\n")
  git("add", "src/base.ts")
  git("commit", "-qm", "base")
  git("branch", "baseline")
  fs.writeFileSync(path.join(root, "src", "feature.ts"), "export const feature = true\n")
  git("add", "src/feature.ts")
  git("commit", "-qm", "feature")
  fs.mkdirSync(path.join(root, ".assistive-tools"))
  fs.writeFileSync(path.join(root, ".assistive-tools", "release-readiness.md"), "generated\n")
  fs.writeFileSync(path.join(root, "notes.txt"), "draft\n")

  const first = workflowModule.collectGitSnapshot(root, "baseline", [
    ".assistive-tools/release-readiness.md",
  ])
  assert.deepEqual(first.files, ["notes.txt", "src/feature.ts"])
  assert.deepEqual(first.workingFiles, ["notes.txt"])
  assert.equal(first.clean, false)

  fs.writeFileSync(path.join(root, "notes.txt"), "changed draft\n")
  const second = workflowModule.collectGitSnapshot(root, "baseline", [
    ".assistive-tools/release-readiness.md",
  ])
  assert.notEqual(first.signature, second.signature)
})

test("git workflow snapshot hashes a symlink without reading its external target", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-git-link-root-"))
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "assistive-tools-git-link-outside-"))
  context.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })
  const git = (...args) => execFileSync("git", args, { cwd: root, stdio: "ignore" })
  git("init", "-q")
  git("config", "user.name", "Assistive Test")
  git("config", "user.email", "assistive@example.com")
  fs.writeFileSync(path.join(root, "base.txt"), "base\n")
  git("add", "base.txt")
  git("commit", "-qm", "base")

  const outsideFile = path.join(outside, "secret.txt")
  fs.writeFileSync(outsideFile, "first external content\n")
  fs.symlinkSync(outsideFile, path.join(root, "external-link.txt"))
  const first = workflowModule.collectGitSnapshot(root)
  fs.writeFileSync(outsideFile, "second external content\n")
  const second = workflowModule.collectGitSnapshot(root)

  assert.deepEqual(first.files, ["external-link.txt"])
  assert.equal(first.signature, second.signature)
})
