import { describe, expect, test } from "bun:test"
import { parseNotebook } from "./notebook-parser"

describe("notebook parser", () => {
  test("reads an R kernel and preserves markdown/code cells", () => {
    const value = parseNotebook(
      JSON.stringify({
        metadata: { kernelspec: { language: "R" } },
        cells: [
          { cell_type: "markdown", source: ["# Analysis"] },
          { cell_type: "code", source: ["summary(iris)"], outputs: [] },
        ],
      }),
    )
    expect(value).toMatchObject({ language: "r", cells: [{ type: "markdown" }, { type: "code", source: "summary(iris)" }] })
  })
})
