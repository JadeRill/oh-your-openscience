export type NotebookCell = {
  type: "markdown" | "code"
  source: string
  outputs: string[]
}

export type ParsedNotebook = {
  language: string
  cells: NotebookCell[]
}

export function parseNotebook(text: string): ParsedNotebook | undefined {
  const parsed = (() => {
    try {
      return JSON.parse(text) as {
        cells?: unknown[]
        metadata?: { kernelspec?: { language?: unknown }; language_info?: { name?: unknown } }
      }
    } catch {
      return undefined
    }
  })()
  if (!Array.isArray(parsed?.cells)) return
  const value = parsed.metadata?.kernelspec?.language ?? parsed.metadata?.language_info?.name
  const language = typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "python"
  const cells: NotebookCell[] = parsed.cells.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const cell = entry as { cell_type?: unknown; source?: unknown; outputs?: unknown }
    if (cell.cell_type !== "markdown" && cell.cell_type !== "code") return []
    const source = Array.isArray(cell.source)
      ? cell.source.join("")
      : typeof cell.source === "string"
        ? cell.source
        : ""
    const outputs = !Array.isArray(cell.outputs)
      ? []
      : cell.outputs.flatMap((output) => {
          if (!output || typeof output !== "object") return []
          const value = output as { text?: unknown; data?: unknown; output_type?: unknown; ename?: unknown; evalue?: unknown }
          if (value.output_type === "error") return [`${value.ename ?? "Error"}: ${value.evalue ?? ""}`]
          if (Array.isArray(value.text)) return [value.text.join("")]
          if (typeof value.text === "string") return [value.text]
          if (!value.data || typeof value.data !== "object") return []
          const plain = (value.data as Record<string, unknown>)["text/plain"]
          if (Array.isArray(plain)) return [plain.join("")]
          return typeof plain === "string" ? [plain] : []
        })
    return [{ type: cell.cell_type, source, outputs }]
  })
  return { language, cells }
}
