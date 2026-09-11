import { describe, expect, test } from "bun:test"
import { parseRMarkdown } from "./rmarkdown"

describe("R Markdown parser", () => {
  test("parses labelled R chunks used by RStudio and Quarto", () => {
    expect(parseRMarkdown("# Report\n\n```{r setup}\nx <- 1\n```\n\nDone.")).toEqual([
      { kind: "markdown", text: "# Report\n" },
      { kind: "r", text: "x <- 1" },
      { kind: "markdown", text: "\nDone." },
    ])
  })

  test("supports plain R fences", () => {
    expect(parseRMarkdown("```r\nplot(cars)\n```" )).toEqual([{ kind: "r", text: "plot(cars)" }])
  })

  test("hides Quarto YAML front matter from the report preview", () => {
    expect(parseRMarkdown("---\ntitle: Test\nformat: html\n---\n\n```{r}\n1 + 1\n```" )).toEqual([
      { kind: "r", text: "1 + 1" },
    ])
  })
})
