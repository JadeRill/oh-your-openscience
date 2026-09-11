export type RMarkdownChunk = { kind: "markdown" | "r"; text: string }

/** Split R Markdown/Quarto into prose and executable R chunks. */
export function parseRMarkdown(text: string): RMarkdownChunk[] {
  const lines = text.split("\n")
  // Quarto/R Markdown metadata is document configuration, not prose. Hiding
  // it keeps the preview focused on the report and avoids showing YAML as if
  // it were analysis output.
  if (lines[0]?.trim() === "---") {
    const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line.trim()))
    if (end !== -1) lines.splice(0, end + 1)
  }
  const chunks: RMarkdownChunk[] = []
  let markdown: string[] = []
  let code: string[] | undefined

  const flushMarkdown = () => {
    const text = markdown.join("\n")
    if (text) chunks.push({ kind: "markdown", text })
    markdown = []
  }

  for (const line of lines) {
    if (!code && /^```(?:\{r(?:\s+[^}]*)?\}|r)\s*$/i.test(line.trim())) {
      flushMarkdown()
      code = []
      continue
    }
    if (code && line.trim() === "```") {
      chunks.push({ kind: "r", text: code.join("\n") })
      code = undefined
      continue
    }
    ;(code ?? markdown).push(line)
  }

  // Keep an unfinished fence visible instead of silently dropping user code.
  if (code) markdown.push("```{r}\n", ...code, "\n```")
  flushMarkdown()
  return chunks
}
