import { For, Match, Show, Switch, createSignal, type JSX } from "solid-js"
import { useParams } from "@solidjs/router"
import { Markdown } from "@synsci/ui/markdown"
import { DataTableView } from "@/data/DataTableView"
import { MarkdownDocument } from "../MarkdownDocument"
import { useSDK } from "@/context/sdk"
import type { ViewerResolution } from "./viewer-registry"
import { parseRMarkdown } from "./rmarkdown"
import { parseNotebook } from "./notebook-parser"
import "../FilePreview.css"

type RenderedOutput = { kind: "text" | "image"; value: string }
async function executeCode(sdk: ReturnType<typeof useSDK>, input: { sessionID: string; language: string; source: string; code: string }) {
  const response = await sdk.request("/kernels/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error((await response.text()) || `${response.status} ${response.statusText}`)
  return kernelOutputs((await response.json()) as { outputs?: Array<Record<string, unknown>> })
}

function kernelOutputs(result: { outputs?: Array<Record<string, unknown>> }): RenderedOutput[] {
  return (result.outputs ?? []).flatMap((output): RenderedOutput[] => {
    if (output.output_type === "error") {
      return [{ kind: "text" as const, value: `${output.ename ?? "Error"}: ${output.evalue ?? ""}` }]
    }
    const data = output.data
    if (data && typeof data === "object") {
      const image = (data as Record<string, unknown>)["image/png"]
      if (typeof image === "string" && image) return [{ kind: "image" as const, value: `data:image/png;base64,${image}` }]
      const plain = (data as Record<string, unknown>)["text/plain"]
      if (typeof plain === "string") return [{ kind: "text" as const, value: plain }]
      if (Array.isArray(plain)) return [{ kind: "text" as const, value: plain.join("") }]
    }
    const value = output.text
    if (Array.isArray(value)) return [{ kind: "text" as const, value: value.join("") }]
    return typeof value === "string" ? [{ kind: "text" as const, value }] : []
  })
}

function RConsole(props: {
  sessionID?: string
  language: string
  source: string
}): JSX.Element {
  const sdk = useSDK()
  const [open, setOpen] = createSignal(false)
  const [code, setCode] = createSignal("")
  const [running, setRunning] = createSignal(false)
  const [outputs, setOutputs] = createSignal<RenderedOutput[]>([])

  const execute = async () => {
    const source = code().trim()
    if (!source) return
    const sessionID = props.sessionID
    if (!sessionID || sessionID === "new") {
      setOutputs([{ kind: "text", value: "请先在一个已有会话中运行 R Console。" }])
      return
    }
    setRunning(true)
    try {
      const rendered = await executeCode(sdk, {
        sessionID,
        language: props.language,
        source: props.source,
        code: source,
      })
      setOutputs(rendered.length ? rendered : [{ kind: "text", value: "（执行完成，无输出）" }])
      setCode("")
    } catch (error) {
      setOutputs([{ kind: "text", value: error instanceof Error ? error.message : String(error) }])
    } finally {
      setRunning(false)
    }
  }

  return (
    <section class="atlas-r-console">
      <button type="button" class="atlas-r-console-toggle" onClick={() => setOpen(!open())}>
        {open() ? "关闭 R Console" : "打开 R Console"}
      </button>
      <Show when={open()}>
        <div class="atlas-r-console-panel">
          <textarea
            class="atlas-r-console-input"
            value={code()}
            placeholder={props.language === "r" ? "> 输入 R 代码" : "> 输入代码"}
            aria-label="R Console 输入"
            onInput={(event) => setCode(event.currentTarget.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault()
                void execute()
              }
            }}
          />
          <div class="atlas-r-console-actions">
            <span>⌘/Ctrl + Enter 执行</span>
            <button type="button" onClick={() => void execute()} disabled={running() || !code().trim()}>
              {running() ? "运行中…" : "运行"}
            </button>
          </div>
          <For each={outputs()}>
            {(output) =>
              output.kind === "image" ? (
                <img class="atlas-file-notebook-image" src={output.value} alt="Console 图形输出" />
              ) : (
                <pre class="atlas-file-notebook-code atlas-file-notebook-output">{output.value}</pre>
              )
            }
          </For>
        </div>
      </Show>
    </section>
  )
}

function RMarkdownView(props: { name: string; text: string; sessionID?: string }): JSX.Element {
  const sdk = useSDK()
  const params = useParams()
  const [running, setRunning] = createSignal<number>()
  const [outputs, setOutputs] = createSignal<Record<number, RenderedOutput[]>>({})
  const chunks = () => parseRMarkdown(props.text)

  async function execute(index: number, code: string) {
    const sessionID = props.sessionID ?? params.id
    if (!sessionID || sessionID === "new") {
      setOutputs((current) => ({
        ...current,
        [index]: [{ kind: "text", value: "请先在一个已有会话中运行代码块。" }],
      }))
      return
    }
    setRunning(index)
    try {
      const rendered = await executeCode(sdk, {
        sessionID,
        language: "r",
        source: props.name,
        code,
      })
      setOutputs((current) => ({
        ...current,
        [index]: rendered.length ? rendered : [{ kind: "text", value: "（代码块执行完成，无文本输出）" }],
      }))
    } catch (error) {
      setOutputs((current) => ({
        ...current,
        [index]: [{ kind: "text", value: error instanceof Error ? error.message : String(error) }],
      }))
    } finally {
      setRunning(undefined)
    }
  }

  return (
    <>
      <article class="atlas-file-document atlas-file-rmarkdown">
        <For each={chunks()}>
          {(chunk, index) => (
            <Show when={chunk.kind === "r"} fallback={<Markdown class="atlas-md" text={chunk.text} />}>
              <section class="atlas-file-rmarkdown-chunk">
                <header class="atlas-file-rmarkdown-toolbar">
                  <span>R code</span>
                  <button type="button" onClick={() => void execute(index(), chunk.text)} disabled={running() !== undefined}>
                    {running() === index() ? "运行中…" : "运行此代码块"}
                  </button>
                </header>
                <pre class="atlas-file-notebook-code">{chunk.text}</pre>
                <For each={outputs()[index()] ?? []}>
                  {(output) =>
                    output.kind === "image" ? (
                      <img class="atlas-file-notebook-image" src={output.value} alt="R 图形输出" />
                    ) : (
                      <pre class="atlas-file-notebook-code atlas-file-notebook-output">{output.value}</pre>
                    )
                  }
                </For>
              </section>
            </Show>
          )}
        </For>
      </article>
      <RConsole sessionID={props.sessionID} language="r" source={props.name} />
    </>
  )
}

export function TextContentView(props: {
  name: string
  text: string
  viewer: ViewerResolution
  sessionID?: string
}): JSX.Element {
  const sdk = useSDK()
  const parsedNotebook = () => (props.viewer.kind === "notebook" ? parseNotebook(props.text) : undefined)
  const cells = () => parsedNotebook()?.cells
  const [running, setRunning] = createSignal<number>()
  const [outputs, setOutputs] = createSignal<Record<number, RenderedOutput[]>>({})
  const notebookLanguage = () => parsedNotebook()?.language ?? "python"

  async function executeNotebookCell(index: number, code: string) {
    const sessionID = props.sessionID
    if (!sessionID || sessionID === "new") {
      setOutputs((current) => ({
        ...current,
        [index]: [{ kind: "text", value: "请先在一个已有会话中运行代码单元格。" }],
      }))
      return
    }
    setRunning(index)
    try {
      const rendered = await executeCode(sdk, {
        sessionID,
        language: notebookLanguage(),
        source: props.viewer.extension === "ipynb" ? props.viewer.extension : "notebook",
        code,
      })
      setOutputs((current) => ({
        ...current,
        [index]: rendered.length ? rendered : [{ kind: "text", value: "（代码单元格执行完成，无文本输出）" }],
      }))
    } catch (error) {
      setOutputs((current) => ({
        ...current,
        [index]: [{ kind: "text", value: error instanceof Error ? error.message : String(error) }],
      }))
    } finally {
      setRunning(undefined)
    }
  }
  const rmarkdown = () => ["rmd", "qmd"].includes(props.viewer.extension)
  return (
    <Switch fallback={<pre class="remote-view__text">{props.text}</pre>}>
      <Match when={props.viewer.kind === "markdown"}>
        <Show when={rmarkdown()} fallback={<MarkdownDocument name={props.name} text={props.text} />}>
          <RMarkdownView name={props.name} text={props.text} sessionID={props.sessionID} />
        </Show>
      </Match>
      <Match when={props.viewer.kind === "table" && props.viewer.table}>
        <DataTableView text={props.text} format={props.viewer.table!} name={props.name} />
      </Match>
      <Match when={props.viewer.kind === "notebook" && cells()}>
        <article aria-label={`${props.name} notebook`} class="atlas-file-document atlas-file-notebook">
          <For each={cells()}>
            {(cell, index) => (
              <section class="atlas-file-notebook-cell" data-cell-type={cell.type}>
                <Show when={cell.type === "code"}>
                  <header class="atlas-file-notebook-label">
                    <span>In [{index() + 1}]</span>
                    <button
                      type="button"
                      onClick={() => void executeNotebookCell(index(), cell.source)}
                      disabled={running() !== undefined}
                    >
                      {running() === index() ? "运行中…" : "运行此单元格"}
                    </button>
                  </header>
                </Show>
                <Show
                  when={cell.type === "markdown"}
                  fallback={<pre class="atlas-file-notebook-code">{cell.source}</pre>}
                >
                  <Markdown class="atlas-md" text={cell.source} />
                </Show>
                <For each={cell.outputs}>
                  {(output) => <pre class="atlas-file-notebook-code atlas-file-notebook-output">{output}</pre>}
                </For>
                <For each={outputs()[index()] ?? []}>
                  {(output) =>
                    output.kind === "image" ? (
                      <img class="atlas-file-notebook-image" src={output.value} alt="Notebook 图形输出" />
                    ) : (
                      <pre class="atlas-file-notebook-code atlas-file-notebook-output">{output.value}</pre>
                    )
                  }
                </For>
              </section>
            )}
          </For>
        </article>
        <Show when={notebookLanguage() === "r"}>
          <RConsole sessionID={props.sessionID} language="r" source={props.name} />
        </Show>
      </Match>
    </Switch>
  )
}
