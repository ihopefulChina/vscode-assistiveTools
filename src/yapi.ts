import * as vscode from "vscode";
import fetch from "node-fetch";

type YapiQueryItem = {
  name: string;
  required?: string;
  desc?: string;
  example?: string;
};

type YapiFormItem = {
  name: string;
  required?: string;
  desc?: string;
  type?: string;
  example?: string;
};

type JsonSchemaType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "any";

type JsonSchema = {
  type?: JsonSchemaType;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  description?: string;
  enum?: (string | number | boolean | null)[];
  title?: string;
};

type YapiInterfaceDetail = {
  _id: number;
  title?: string;
  method?: string;
  path?: string;
  req_query?: YapiQueryItem[];
  req_body_type?: string;
  req_body_is_json_schema?: boolean;
  req_body_other?: string;
  req_body_form?: YapiFormItem[];
  res_body?: string;
  res_body_is_json_schema?: boolean;
};

type YapiResponse = {
  errcode: number;
  errmsg: string;
  data?: YapiInterfaceDetail;
};

/**
 * 注册 YAPI interface 生成命令
 */
export default function registerYapiInterfaceGenerator(
  context: vscode.ExtensionContext
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "assistiveTools.generateYapiInterface",
      async () => {
        const token = getToken();
        if (!token) {
          await guideToTokenSettings();
          return;
        }

        const urlInput = await vscode.window.showInputBox({
          placeHolder:
            "例如：https://doc.soulapp-inc.cn/project/25/interface/api/80173",
          prompt: "请输入 YAPI 接口文档地址",
          validateInput(value) {
            return value.trim() ? undefined : "地址不能为空";
          },
        });

        if (!urlInput) {
          return;
        }

        const parsed = tryParseUrl(urlInput.trim());
        if (!parsed) {
          void vscode.window.showErrorMessage("请输入合法的 URL 地址");
          return;
        }

        const interfaceId = extractInterfaceId(parsed);
        if (!interfaceId) {
          void vscode.window.showErrorMessage(
            "未从地址中解析到接口 ID，请检查链接是否为接口详情页"
          );
          return;
        }

        const apiUrl = `${parsed.origin}/api/interface/get?id=${interfaceId}`;
        const detail = await fetchInterfaceDetail(
          apiUrl,
          parsed.href,
          token,
          interfaceId
        );
        if (!detail) {
          return;
        }

        const snippet = buildInterfaceSnippet(detail, interfaceId);
        if (!snippet) {
          void vscode.window.showWarningMessage(
            "未获取到可生成的请求或响应信息"
          );
          return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          const doc = await vscode.workspace.openTextDocument({
            content: snippet,
            language: "typescript",
          });
          await vscode.window.showTextDocument(doc, {
            preview: false,
          });
        } else {
          await editor.edit((editBuilder) => {
            editBuilder.insert(editor.selection.active, snippet);
          });
        }

        void vscode.window.showInformationMessage("YAPI interface 已生成");
      }
    )
  );
}

function getToken(): string | undefined {
  const config = vscode.workspace.getConfiguration("assistiveTools");
  const token = config.get<string>("yapiToken");
  return token?.trim();
}

async function guideToTokenSettings() {
  const action = await vscode.window.showWarningMessage(
    "尚未配置 `_yapi_token`，请先在设置中填写后重试。",
    "打开设置"
  );
  if (action === "打开设置") {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "assistiveTools.yapiToken"
    );
  }
}

function tryParseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function extractInterfaceId(url: URL): string | undefined {
  const byQuery = url.searchParams.get("id");
  if (byQuery) {
    return byQuery;
  }
  const match = url.pathname.match(/(\d+)(?:\/)?$/);
  return match?.[1];
}

async function fetchInterfaceDetail(
  apiUrl: string,
  referer: string,
  token: string,
  interfaceId: string
): Promise<YapiInterfaceDetail | undefined> {
  try {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在拉取接口 ${interfaceId}`,
        cancellable: false,
      },
      async () => {
        const response = await fetch(apiUrl, {
          headers: {
            accept: "application/json",
            cookie: `_yapi_token=${token}`,
            referer,
          },
        });

        if (!response.ok) {
          throw new Error(
            `请求失败，HTTP 状态码 ${response.status}: ${response.statusText}`
          );
        }

        const json = (await response.json()) as YapiResponse;
        if (json.errcode !== 0 || !json.data) {
          throw new Error(json.errmsg || "YAPI 返回异常");
        }
        return json.data;
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "未知错误，请稍后重试";
    void vscode.window.showErrorMessage(`获取 YAPI 接口失败：${message}`);
    return undefined;
  }
}

function buildInterfaceSnippet(
  detail: YapiInterfaceDetail,
  interfaceId: string
): string {
  const title = detail.title || `接口 ${interfaceId}`;
  const header = `// ${title} (${detail.method ?? "GET"} ${detail.path ?? ""})`;
  const baseName =
    toPascalCase(title) ||
    `Interface${interfaceId.replace(/[^0-9A-Za-z]/g, "")}`;
  const prefix = baseName.startsWith("I") ? baseName : `I${baseName}`;
  const segments: string[] = [header];

  const queryCode = buildQueryInterface(detail.req_query, `${prefix}Query`);
  if (queryCode) {
    segments.push(queryCode);
  }

  const bodyCode = buildRequestBody(detail, `${prefix}Body`);
  if (bodyCode) {
    segments.push(bodyCode);
  }

  const responseCode = buildResponseInterface(detail, `${prefix}Response`);
  if (responseCode) {
    segments.push(responseCode);
  }

  if (segments.length <= 1) {
    return "";
  }
  return segments.join("\n\n");
}

function buildQueryInterface(
  queryItems: YapiQueryItem[] | undefined,
  name: string
): string | undefined {
  if (!queryItems || queryItems.length === 0) {
    return undefined;
  }
  const lines = [`interface ${name} {`];
  queryItems.forEach((item) => {
    if (!item.name) {
      return;
    }
    const propName = formatPropertyName(item.name);
    const optional = item.required === "1" ? "" : "?";
    if (item.desc) {
      lines.push(`  /** ${item.desc} */`);
    }
    lines.push(`  ${propName}${optional}: string;`);
  });
  lines.push("}");
  return lines.join("\n");
}

function buildRequestBody(
  detail: YapiInterfaceDetail,
  name: string
): string | undefined {
  const schema = parseSchema(
    detail.req_body_is_json_schema,
    detail.req_body_other
  );
  if (schema) {
    return assembleInterfacesFromSchema(schema, name);
  }

  const sample = safeParseJson(detail.req_body_other);
  if (sample && typeof sample === "object") {
    const inferred = inferSchemaFromSample(sample);
    return assembleInterfacesFromSchema(inferred, name);
  }

  if (detail.req_body_form && detail.req_body_form.length > 0) {
    const lines = [`interface ${name} {`];
    detail.req_body_form.forEach((item) => {
      if (!item.name) {
        return;
      }
      const propName = formatPropertyName(item.name);
      const optional = item.required === "1" ? "" : "?";
      const valueType = mapFormType(item.type);
      if (item.desc) {
        lines.push(`  /** ${item.desc} */`);
      }
      lines.push(`  ${propName}${optional}: ${valueType};`);
    });
    lines.push("}");
    return lines.join("\n");
  }

  return undefined;
}

function buildResponseInterface(
  detail: YapiInterfaceDetail,
  name: string
): string | undefined {
  if (!detail.res_body) {
    return undefined;
  }

  if (detail.res_body_is_json_schema) {
    const schema = parseSchema(true, detail.res_body);
    if (schema) {
      return assembleInterfacesFromSchema(schema, name);
    }
  }

  const sample = safeParseJson(detail.res_body);
  if (sample) {
    const schema = inferSchemaFromSample(sample);
    return assembleInterfacesFromSchema(schema, name);
  }

  return undefined;
}

function parseSchema(
  isSchema: boolean | undefined,
  content: string | undefined
): JsonSchema | undefined {
  if (!content) {
    return undefined;
  }
  if (!isSchema) {
    return undefined;
  }
  return safeParseJson(content);
}

function safeParseJson<T = any>(value?: string): T | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function assembleInterfacesFromSchema(
  schema: JsonSchema,
  name: string
): string {
  const queue: Array<{ schema: JsonSchema; name: string }> = [
    { schema, name: ensureInterfaceName(name) },
  ];
  const emitted = new Set<string>();
  const blocks: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const interfaceName = ensureInterfaceName(current.name);
    if (emitted.has(interfaceName)) {
      continue;
    }

    if (current.schema.type === "object" && current.schema.properties) {
      const lines = [`interface ${interfaceName} {`];
      const required = new Set(current.schema.required ?? []);
      const entries = Object.entries(current.schema.properties);
      if (entries.length === 0) {
        lines.push("  [key: string]: any;");
      } else {
        entries.forEach(([key, value]) => {
          const propName = formatPropertyName(key);
          const optional = required.has(key) ? "" : "?";
          const { typeName, enqueue } = resolveSchemaType(
            value,
            `${interfaceName}${toPascalCase(key)}`
          );
          if (enqueue) {
            queue.push(enqueue);
          }
          if (value.description) {
            lines.push(`  /** ${value.description} */`);
          }
          lines.push(`  ${propName}${optional}: ${typeName};`);
        });
      }
      lines.push("}");
      blocks.push(lines.join("\n"));
    } else {
      const simpleType = mapPrimitiveType(current.schema);
      blocks.push(`type ${interfaceName} = ${simpleType};`);
    }

    emitted.add(interfaceName);
  }

  return blocks.join("\n\n");
}

function resolveSchemaType(
  schema: JsonSchema | undefined,
  nextName: string
): {
  typeName: string;
  enqueue?: { schema: JsonSchema; name: string };
} {
  if (!schema) {
    return { typeName: "any" };
  }

  if (schema.enum && schema.enum.length > 0) {
    const enumLiteral = schema.enum
      .map((item) =>
        typeof item === "string"
          ? `'${item}'`
          : item === null
          ? "null"
          : String(item)
      )
      .join(" | ");
    return { typeName: enumLiteral };
  }

  switch (schema.type) {
    case "string":
      return { typeName: "string" };
    case "number":
    case "integer":
      return { typeName: "number" };
    case "boolean":
      return { typeName: "boolean" };
    case "null":
      return { typeName: "null" };
    case "array": {
      const items = schema.items;
      if (!items) {
        return { typeName: "any[]" };
      }
      const childName = `${nextName}Item`;
      if (items.type === "object" && items.properties) {
        return {
          typeName: `${ensureInterfaceName(childName)}[]`,
          enqueue: { schema: items, name: childName },
        };
      }
      const resolved = resolveSchemaType(items, childName);
      return { typeName: `${resolved.typeName}[]`, enqueue: resolved.enqueue };
    }
    case "object":
      if (schema.properties) {
        const childName = ensureInterfaceName(nextName);
        return {
          typeName: childName,
          enqueue: { schema, name: childName },
        };
      }
      return { typeName: "{ [key: string]: any }" };
    default:
      return { typeName: "any" };
  }
}

function mapPrimitiveType(schema: JsonSchema | undefined): string {
  if (!schema) {
    return "any";
  }
  switch (schema.type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return "any[]";
    case "object":
      return "{ [key: string]: any }";
    default:
      return "any";
  }
}

function formatPropertyName(value: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(value) ? value : `'${value}'`;
}

function ensureInterfaceName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_$]/g, "");
  const normalized = cleaned ? cleaned : "Generated";
  return /^[A-Za-z_$]/.test(normalized)
    ? normalized
    : `I${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function toPascalCase(value: string): string {
  return value
    .replace(/[\s_\-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join("");
}

function mapFormType(type: string | undefined): string {
  switch (type) {
    case "text":
    case "textarea":
    case "file":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    default:
      return "string";
  }
}

function inferSchemaFromSample(sample: any): JsonSchema {
  if (Array.isArray(sample)) {
    return {
      type: "array",
      items:
        sample.length > 0 ? inferSchemaFromSample(sample[0]) : { type: "any" },
    };
  }
  switch (typeof sample) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object":
      if (sample === null) {
        return { type: "null" };
      }
      const properties: Record<string, JsonSchema> = {};
      Object.entries(sample).forEach(([key, value]) => {
        properties[key] = inferSchemaFromSample(value);
      });
      return {
        type: "object",
        properties,
      };
    default:
      return { type: "any" };
  }
}
