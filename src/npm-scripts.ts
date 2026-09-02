import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import * as yaml from "js-yaml"

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun"

type PackageJson = {
  name?: string
  packageManager?: string
  scripts?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

export type PackageScripts = {
  workspaceFolder: vscode.WorkspaceFolder
  packageJsonPath: string
  packageDirectory: string
  relativeDirectory: string
  packageName: string
  isRoot: boolean
  packageManager: PackageManager
  scripts: Array<{ name: string; command: string }>
}

const FAVORITES_KEY = "assistiveTools.scripts.favorites"
const RECENTS_KEY = "assistiveTools.scripts.recents"
const FAVORITES_ONLY_KEY = "assistiveTools.scripts.favoritesOnly"

export function getWorkspacePatterns(
  packageJson: PackageJson,
  pnpmWorkspaceContent?: string
): { include: string[]; exclude: string[] } {
  const rawPatterns: string[] = []
  const workspaces = packageJson.workspaces
  if (Array.isArray(workspaces)) {
    rawPatterns.push(...workspaces)
  } else if (workspaces && Array.isArray(workspaces.packages)) {
    rawPatterns.push(...workspaces.packages)
  }

  if (pnpmWorkspaceContent) {
    const parsed = yaml.load(pnpmWorkspaceContent) as { packages?: unknown } | undefined
    if (Array.isArray(parsed?.packages)) {
      rawPatterns.push(
        ...parsed!.packages.filter((item): item is string => typeof item === "string")
      )
    }
  }

  const include = new Set<string>()
  const exclude = new Set<string>()
  for (const rawPattern of rawPatterns) {
    const trimmed = rawPattern.trim().replace(/^\.\//, "").replace(/\/$/, "")
    if (!trimmed) continue
    if (trimmed.startsWith("!")) {
      if (trimmed.slice(1)) exclude.add(trimmed.slice(1))
    } else {
      include.add(trimmed)
    }
  }
  return { include: [...include], exclude: [...exclude] }
}

export function detectPackageManager(
  workspaceRoot: string,
  packageJson?: PackageJson
): PackageManager {
  const declared = packageJson?.packageManager?.split("@")[0]
  if (declared === "npm" || declared === "pnpm" || declared === "yarn" || declared === "bun") {
    return declared
  }
  if (
    fs.existsSync(path.join(workspaceRoot, "pnpm-lock.yaml")) ||
    fs.existsSync(path.join(workspaceRoot, "pnpm-workspace.yaml"))
  ) {
    return "pnpm"
  }
  if (fs.existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn"
  if (
    fs.existsSync(path.join(workspaceRoot, "bun.lock")) ||
    fs.existsSync(path.join(workspaceRoot, "bun.lockb"))
  ) {
    return "bun"
  }
  return "npm"
}

export function buildScriptCommand(
  packageManager: PackageManager,
  scriptName: string
): { command: string; args: string[] } {
  if (packageManager === "yarn") {
    return { command: "yarn", args: ["run", scriptName] }
  }
  if (packageManager === "pnpm") {
    return { command: "pnpm", args: ["run", scriptName] }
  }
  if (packageManager === "bun") {
    return { command: "bun", args: ["run", scriptName] }
  }
  return { command: "npm", args: ["run", scriptName] }
}

export async function discoverWorkspacePackages(
  workspaceFolder: vscode.WorkspaceFolder
): Promise<PackageScripts[]> {
  const workspaceRoot = workspaceFolder.uri.fsPath
  const rootPackagePath = path.join(workspaceRoot, "package.json")
  if (!fs.existsSync(rootPackagePath)) {
    return []
  }

  let rootPackage: PackageJson
  try {
    rootPackage = readPackageJson(rootPackagePath)
  } catch {
    return []
  }
  const pnpmWorkspacePath = path.join(workspaceRoot, "pnpm-workspace.yaml")
  const pnpmContent = fs.existsSync(pnpmWorkspacePath)
    ? fs.readFileSync(pnpmWorkspacePath, "utf-8")
    : undefined
  const patterns = getWorkspacePatterns(rootPackage, pnpmContent)
  const packageManager = detectPackageManager(workspaceRoot, rootPackage)
  const packagePaths = new Set<string>([rootPackagePath])

  const matches = await Promise.all(
    patterns.include.map((pattern) => {
      const packagePattern = pattern.endsWith("package.json") ? pattern : `${pattern}/package.json`
      return vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceFolder, packagePattern),
        "**/{node_modules,.git,dist,build,out,.next,.turbo}/**"
      )
    })
  )
  for (const uri of matches.flat()) {
    const relativeDirectory = normalizeRelativePath(
      path.relative(workspaceRoot, path.dirname(uri.fsPath))
    )
    if (!patterns.exclude.some((pattern) => globMatches(pattern, relativeDirectory))) {
      packagePaths.add(uri.fsPath)
    }
  }

  return [...packagePaths]
    .map((packageJsonPath): PackageScripts | undefined => {
      let packageJson: PackageJson
      try {
        packageJson = readPackageJson(packageJsonPath)
      } catch {
        return undefined
      }
      const packageDirectory = path.dirname(packageJsonPath)
      const relativeDirectory = normalizeRelativePath(
        path.relative(workspaceRoot, packageDirectory)
      )
      const scripts = Object.entries(packageJson.scripts || {})
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([name, command]) => ({ name, command }))
      if (scripts.length === 0) {
        return undefined
      }
      return {
        workspaceFolder,
        packageJsonPath,
        packageDirectory,
        relativeDirectory,
        packageName:
          packageJson.name ||
          (relativeDirectory ? path.basename(packageDirectory) : workspaceFolder.name),
        isRoot: packageJsonPath === rootPackagePath,
        packageManager,
        scripts,
      }
    })
    .filter((item): item is PackageScripts => !!item)
    .sort((left, right) => {
      if (left.isRoot !== right.isRoot) return left.isRoot ? -1 : 1
      return left.relativeDirectory.localeCompare(right.relativeDirectory)
    })
}

function readPackageJson(packageJsonPath: string): PackageJson {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJson
}

function normalizeRelativePath(value: string): string {
  return value.split(path.sep).join("/")
}

function globMatches(pattern: string, value: string): boolean {
  let source = "^"
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*"
        index += 1
      } else {
        source += "[^/]*"
      }
    } else if (character === "?") {
      source += "[^/]"
    } else {
      source += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
    }
  }
  return new RegExp(`${source}$`).test(value)
}

type ScriptsTreeNode = WorkspaceScriptsItem | PackageScriptsItem | ScriptItem

class WorkspaceScriptsItem extends vscode.TreeItem {
  public readonly contextValue = "assistiveScripts.workspace"

  constructor(
    public readonly folder: vscode.WorkspaceFolder,
    public readonly packages: PackageScriptsItem[]
  ) {
    super(folder.name, vscode.TreeItemCollapsibleState.Expanded)
    const scriptCount = packages.reduce((total, item) => total + item.scripts.length, 0)
    this.description = `${packages.length} 个 package · ${scriptCount} 个脚本`
    this.tooltip = `${folder.uri.fsPath}\n已发现 ${packages.length} 个 package、${scriptCount} 个脚本`
    this.iconPath = new vscode.ThemeIcon("root-folder")
  }
}

class PackageScriptsItem extends vscode.TreeItem {
  public readonly contextValue = "assistiveScripts.package"

  constructor(
    public readonly definition: PackageScripts,
    public readonly scripts: ScriptItem[]
  ) {
    super(
      definition.isRoot ? `${definition.packageName} (根目录)` : definition.packageName,
      vscode.TreeItemCollapsibleState.Collapsed
    )
    this.description = `${definition.isRoot ? "根 package.json" : definition.relativeDirectory} · ${scripts.length} 项`
    this.tooltip = definition.packageJsonPath
    this.iconPath = new vscode.ThemeIcon("package")
  }
}

export class ScriptItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly packageDefinition: PackageScripts,
    public readonly scriptName: string,
    public readonly scriptCommand: string,
    public favorite: boolean,
    public running = false
  ) {
    super(scriptName, vscode.TreeItemCollapsibleState.None)
    this.description = scriptCommand
    this.tooltip = `${packageDefinition.packageManager} run ${scriptName}\n${scriptCommand}`
    this.command = {
      command: "assistiveTools.scripts.run",
      title: "运行脚本",
      arguments: [this],
    }
    this.updatePresentation()
  }

  public updatePresentation(): void {
    this.contextValue = this.running
      ? "assistiveScripts.script.running"
      : this.favorite
        ? "assistiveScripts.script.favorite"
        : "assistiveScripts.script"
    this.iconPath = new vscode.ThemeIcon(
      this.running ? "loading~spin" : this.favorite ? "star-full" : "run"
    )
  }
}

export class NpmScriptsProvider implements vscode.TreeDataProvider<ScriptsTreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<ScriptsTreeNode | undefined>()
  public readonly onDidChangeTreeData = this.changeEmitter.event
  private roots: WorkspaceScriptsItem[] = []
  private scriptsById = new Map<string, ScriptItem>()
  private running = new Map<string, vscode.TaskExecution>()
  private refreshTimer: NodeJS.Timeout | undefined

  constructor(private readonly context: vscode.ExtensionContext) {
    this.context.subscriptions.push(
      vscode.tasks.onDidEndTask((event) => {
        const match = [...this.running.entries()].find(
          ([, execution]) => execution === event.execution
        )
        if (match) {
          this.running.delete(match[0])
          const item = this.scriptsById.get(match[0])
          if (item) {
            item.running = false
            item.updatePresentation()
            this.changeEmitter.fire(item)
          }
        }
      })
    )
  }

  public getTreeItem(element: ScriptsTreeNode): vscode.TreeItem {
    return element
  }

  public getChildren(element?: ScriptsTreeNode): vscode.ProviderResult<ScriptsTreeNode[]> {
    const favoritesOnly = this.context.globalState.get<boolean>(FAVORITES_ONLY_KEY, false)
    if (!element) {
      return favoritesOnly
        ? this.roots.filter((root) =>
            root.packages.some((item) => item.scripts.some((script) => script.favorite))
          )
        : this.roots
    }
    if (element instanceof WorkspaceScriptsItem) {
      return favoritesOnly
        ? element.packages.filter((item) => item.scripts.some((script) => script.favorite))
        : element.packages
    }
    if (element instanceof PackageScriptsItem) {
      return favoritesOnly ? element.scripts.filter((script) => script.favorite) : element.scripts
    }
    return []
  }

  public async refresh(): Promise<void> {
    const favorites = new Set(this.context.globalState.get<string[]>(FAVORITES_KEY, []))
    const folders = vscode.workspace.workspaceFolders || []
    const definitions = await Promise.all(folders.map(discoverWorkspacePackages))
    const scriptsById = new Map<string, ScriptItem>()
    this.roots = definitions
      .map((packages, index) => {
        const packageItems = packages.map((definition) => {
          const scriptItems = definition.scripts.map((script) => {
            const id = createScriptId(definition, script.name)
            const item = new ScriptItem(
              id,
              definition,
              script.name,
              script.command,
              favorites.has(id),
              this.running.has(id)
            )
            scriptsById.set(id, item)
            return item
          })
          return new PackageScriptsItem(definition, scriptItems)
        })
        return new WorkspaceScriptsItem(folders[index], packageItems)
      })
      .filter((root) => root.packages.length > 0)
    this.scriptsById = scriptsById
    await vscode.commands.executeCommand(
      "setContext",
      "assistiveTools.scripts.favoritesOnly",
      this.context.globalState.get<boolean>(FAVORITES_ONLY_KEY, false)
    )
    this.changeEmitter.fire(undefined)
  }

  public scheduleRefresh(uri?: vscode.Uri): void {
    if (uri?.fsPath && uri.fsPath.split(path.sep).includes("node_modules")) {
      return
    }
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => void this.refresh(), 250)
  }

  public async run(item: ScriptItem): Promise<void> {
    if (!item || this.running.has(item.id)) {
      return
    }
    const invocation = buildScriptCommand(item.packageDefinition.packageManager, item.scriptName)
    const execution = new vscode.ShellExecution(invocation.command, invocation.args, {
      cwd: item.packageDefinition.packageDirectory,
    })
    const task = new vscode.Task(
      {
        type: "assistiveTools",
        script: item.scriptName,
        package: item.packageDefinition.relativeDirectory || ".",
      },
      item.packageDefinition.workspaceFolder,
      `${item.packageDefinition.packageName}: ${item.scriptName}`,
      "Assistive Tools",
      execution
    )
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated,
      clear: false,
    }
    try {
      const taskExecution = await vscode.tasks.executeTask(task)
      this.running.set(item.id, taskExecution)
      item.running = true
      item.updatePresentation()
      await this.recordRecent(item.id)
      this.changeEmitter.fire(item)
    } catch (error: any) {
      vscode.window.showErrorMessage(`运行脚本失败: ${error.message}`)
    }
  }

  public stop(item: ScriptItem): void {
    this.running.get(item.id)?.terminate()
  }

  public async toggleFavorite(item: ScriptItem): Promise<void> {
    const favorites = new Set(this.context.globalState.get<string[]>(FAVORITES_KEY, []))
    if (favorites.has(item.id)) favorites.delete(item.id)
    else favorites.add(item.id)
    await this.context.globalState.update(FAVORITES_KEY, [...favorites])
    item.favorite = favorites.has(item.id)
    item.updatePresentation()
    this.changeEmitter.fire(undefined)
  }

  public async setFavoritesOnly(value: boolean): Promise<void> {
    await this.context.globalState.update(FAVORITES_ONLY_KEY, value)
    await vscode.commands.executeCommand(
      "setContext",
      "assistiveTools.scripts.favoritesOnly",
      value
    )
    this.changeEmitter.fire(undefined)
  }

  public async runRecent(): Promise<void> {
    const recentIds = this.context.globalState.get<string[]>(RECENTS_KEY, [])
    const items = recentIds
      .map((id) => this.scriptsById.get(id))
      .filter((item): item is ScriptItem => !!item)
    if (items.length === 0) {
      vscode.window.showInformationMessage("还没有可用的最近运行脚本")
      return
    }
    const selected = await vscode.window.showQuickPick(
      items.map((item) => ({
        label: item.scriptName,
        description: item.packageDefinition.isRoot
          ? `${item.packageDefinition.packageName} (根目录)`
          : item.packageDefinition.relativeDirectory,
        detail: item.scriptCommand,
        item,
      })),
      { placeHolder: "选择最近运行的脚本" }
    )
    if (selected) await this.run(selected.item)
  }

  private async recordRecent(id: string): Promise<void> {
    const recentIds = this.context.globalState
      .get<string[]>(RECENTS_KEY, [])
      .filter((item) => item !== id)
    recentIds.unshift(id)
    await this.context.globalState.update(RECENTS_KEY, recentIds.slice(0, 20))
  }
}

function createScriptId(definition: PackageScripts, scriptName: string): string {
  return [
    definition.workspaceFolder.uri.toString(),
    definition.relativeDirectory || ".",
    scriptName,
  ].join("::")
}

export function registerNpmScripts(context: vscode.ExtensionContext): void {
  const provider = new NpmScriptsProvider(context)
  const view = vscode.window.createTreeView("assistiveToolsScripts", {
    treeDataProvider: provider,
    showCollapseAll: true,
  })
  const watcher = vscode.workspace.createFileSystemWatcher(
    "**/{package.json,pnpm-workspace.yaml,pnpm-lock.yaml,yarn.lock,package-lock.json,bun.lock,bun.lockb}"
  )
  context.subscriptions.push(
    view,
    watcher,
    watcher.onDidCreate((uri) => provider.scheduleRefresh(uri)),
    watcher.onDidChange((uri) => provider.scheduleRefresh(uri)),
    watcher.onDidDelete((uri) => provider.scheduleRefresh(uri)),
    vscode.commands.registerCommand("assistiveTools.scripts.refresh", () => provider.refresh()),
    vscode.commands.registerCommand("assistiveTools.scripts.run", (item: ScriptItem) =>
      provider.run(item)
    ),
    vscode.commands.registerCommand("assistiveTools.scripts.stop", (item: ScriptItem) =>
      provider.stop(item)
    ),
    vscode.commands.registerCommand("assistiveTools.scripts.toggleFavorite", (item: ScriptItem) =>
      provider.toggleFavorite(item)
    ),
    vscode.commands.registerCommand("assistiveTools.scripts.showFavorites", () =>
      provider.setFavoritesOnly(true)
    ),
    vscode.commands.registerCommand("assistiveTools.scripts.showAll", () =>
      provider.setFavoritesOnly(false)
    ),
    vscode.commands.registerCommand("assistiveTools.scripts.runRecent", () => provider.runRecent())
  )
  context.subscriptions.push(
    view.onDidChangeVisibility((event) => {
      if (event.visible) void provider.refresh()
    })
  )
  void provider.refresh().catch((error: any) => {
    vscode.window.showErrorMessage(`读取工作区脚本失败: ${error.message}`)
  })
}
