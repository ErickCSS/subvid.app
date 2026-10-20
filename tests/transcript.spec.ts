import { expect, test, type Page } from "@playwright/test"

async function select(
  page: Page,
  line: number,
  word: number,
  from: number,
  to: number,
  lastLine = line,
  lastWord = word,
) {
  await page.evaluate(
    ({ line, word, from, to, lastLine, lastWord }) => {
      const root = document.querySelector<HTMLElement>("#transcript")!
      root.focus()
      const start = root.querySelector(
        `.tx-line[data-index="${line}"] .tx-w[data-w="${word}"]`,
      )!.firstChild!
      const end = root.querySelector(
        `.tx-line[data-index="${lastLine}"] .tx-w[data-w="${lastWord}"]`,
      )!.firstChild!
      const range = document.createRange()
      range.setStart(start, from)
      range.setEnd(end, to)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    },
    { line, word, from, to, lastLine, lastWord },
  )
}
const state = (page: Page) =>
  page.evaluate(() => (window as any).fixture.state())
const cuts = (page: Page) => page.evaluate(() => (window as any).fixture.cuts())

test.beforeEach(async ({ page }) => {
  await page.goto("/tests/fixtures/editor.html")
  await expect(page.locator(".tx-w")).toHaveCount(6)
})

for (const key of ["Backspace", "Delete"]) {
  test(`${key} deletes selected words without cutting media; undo and redo work`, async ({
    page,
  }) => {
    await select(page, 0, 1, 0, 5)
    await page.keyboard.press(key)
    expect((await state(page)).segmentsByLang.en[0].text).toBe("Hello world")
    await expect(page.locator(".tx-line").first()).toHaveText("Hello world", {
      useInnerText: true,
    })
    expect(await cuts(page)).toEqual([])
    expect((await state(page)).segmentsByLang.en[0].words[1]).toEqual({
      start: 1,
      end: 1.8,
      text: "",
    })
    await page.getByRole("button", { name: "Undo", exact: true }).click()
    expect((await state(page)).segmentsByLang.en[0].text).toBe(
      "Hello brave world",
    )
    await page.getByRole("button", { name: "Redo", exact: true }).click()
    expect((await state(page)).segmentsByLang.en[0].text).toBe("Hello world")
  })
}

test("ordinary character, word and line deletion preserve media", async ({
  page,
}) => {
  await select(page, 0, 1, 5, 5)
  await page.keyboard.press("Backspace")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("Hello brav world")
  await select(page, 0, 0, 0, 0)
  await page.keyboard.press("Delete")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("ello brav world")
  await select(page, 0, 1, 4, 4)
  await page.keyboard.press("Control+Backspace")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("ello world")
  await select(page, 0, 2, 5, 5)
  await page
    .locator("#transcript")
    .evaluate((el) =>
      el.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteSoftLineBackward",
        }),
      ),
    )
  expect((await state(page)).segmentsByLang.en[0].text).toBe("")
  expect(await cuts(page)).toEqual([])
})

test("deleting across lines and replacing selected text keep all audio", async ({
  page,
}) => {
  await select(page, 0, 1, 2, 2, 1, 0)
  await page.keyboard.press("Backspace")
  expect((await state(page)).segmentsByLang.en.map((s: any) => s.text)).toEqual(
    ["Hello br", "is is fine"],
  )
  expect(await cuts(page)).toEqual([])
  await select(page, 0, 0, 0, 2, 0, 1)
  await page.keyboard.type("Corrected")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("Corrected")
  expect(await cuts(page)).toEqual([])
})

test("empty transcript remains editable and exports no blank SRT entries", async ({
  page,
}) => {
  await page.locator("#transcript").focus()
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Backspace")
  expect(await page.evaluate(() => (window as any).fixture.srt())).toBe("")
  expect(await cuts(page)).toEqual([])
  await page.keyboard.type("New caption")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("New caption")
  expect(await page.evaluate(() => (window as any).fixture.srt())).toContain(
    "00:00:00,000 --> 00:00:03,000",
  )
  expect(await cuts(page)).toEqual([])
})

test("explicit cut requires selection, cuts whole touched words and restores", async ({
  page,
}) => {
  const button = page.getByRole("button", { name: "Cut from video" })
  await expect(button).toBeDisabled()
  await select(page, 0, 1, 1, 3)
  await expect(button).toBeEnabled()
  await button.click()
  expect(await cuts(page)).toEqual([{ start: 1, end: 1.8 }])
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  expect(await cuts(page)).toEqual([])
  await page.getByRole("button", { name: "Redo", exact: true }).click()
  expect(await cuts(page)).toEqual([{ start: 1, end: 1.8 }])
  await expect(page.locator(".tx-cut")).toHaveText("brave")
  await page.locator(".tx-cut").click()
  expect(await cuts(page)).toEqual([])
})

test("keyboard selection and button activation preserve the selection", async ({
  page,
}) => {
  await select(page, 0, 1, 0, 0)
  await page.keyboard.press("Control+Shift+ArrowRight")
  await expect(page.locator("#cut")).toBeEnabled()
  await page.keyboard.press("Shift+Tab")
  await expect(page.locator("#cut")).toBeFocused()
  await page.keyboard.press("Enter")
  expect(await cuts(page)).toEqual([{ start: 1, end: 1.8 }])
})

test("deleting between existing cuts does not join them, including after retyping", async ({
  page,
}) => {
  for (const word of [0, 2]) {
    await select(page, 0, word, 0, 5)
    await page.locator("#cut").click()
  }
  const before = await cuts(page)
  await select(page, 0, 1, 0, 5)
  await page.keyboard.press("Backspace")
  expect(await cuts(page)).toEqual(before)
  await page.keyboard.type("Replacement")
  expect(await cuts(page)).toEqual(before)
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  expect(await cuts(page)).toEqual(before)
})

test("clipboard cut removes text, paste replaces text, translation has no media cut action", async ({
  page,
}) => {
  await select(page, 0, 1, 0, 5)
  await page.keyboard.press("Control+x")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("Hello world")
  await select(page, 0, 2, 0, 5)
  await page.keyboard.press("Control+v")
  await expect
    .poll(async () => (await state(page)).segmentsByLang.en[0].text)
    .toBe("Hello brave")
  expect(await cuts(page)).toEqual([])
  await page.getByRole("button", { name: "Translation" }).click()
  await expect(page.locator("#cut")).toBeHidden()
  await page.locator(".tx-line").fill("Hola")
  expect((await state(page)).segmentsByLang.es[0].text).toBe("Hola")
  expect(await cuts(page)).toEqual([])
})

test("grapheme deletion and IME composition do not cut words", async ({
  page,
}) => {
  await page.evaluate(() =>
    (window as any).fixture.reset([
      {
        start: 0,
        end: 2,
        text: "a👨‍👩‍👧‍👦é",
        words: [{ start: 0, end: 2, text: "a👨‍👩‍👧‍👦é" }],
      },
    ]),
  )
  await select(page, 0, 0, 12, 12)
  await page.keyboard.press("Backspace")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("aé")
  const prevented = await page
    .locator("#transcript")
    .evaluate(
      (el) =>
        !el.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteCompositionText",
            isComposing: true,
          }),
        ),
    )
  expect(prevented).toBe(false)
  expect(await cuts(page)).toEqual([])
})

test("spaces and line boundaries can be deleted without removing media", async ({
  page,
}) => {
  await select(page, 0, 1, 0, 0)
  await page.keyboard.press("Backspace")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("Hellobrave world")
  await select(page, 1, 0, 0, 0)
  await page.keyboard.press("Backspace")
  expect((await state(page)).segmentsByLang.en).toHaveLength(1)
  expect(await cuts(page)).toEqual([])
})

test("forward word deletion and deleting a one-character word only change text", async ({
  page,
}) => {
  await select(page, 0, 1, 0, 0)
  await page.keyboard.press("Control+Delete")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("Hello world")
  await page.evaluate(() =>
    (window as any).fixture.reset([
      { start: 0, end: 2, text: "a", words: [{ start: 0, end: 2, text: "a" }] },
    ]),
  )
  await select(page, 0, 0, 1, 1)
  await page.keyboard.press("Backspace")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("")
  expect(await cuts(page)).toEqual([])
  await page.keyboard.type("Again")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("Again")
})

test("replacement keeps original times and zero-duration inserted words cannot cut media", async ({
  page,
}) => {
  await select(page, 0, 1, 0, 5)
  await page.keyboard.type("better")
  expect((await state(page)).segmentsByLang.en[0].words[1]).toEqual({
    start: 1,
    end: 1.8,
    text: "better",
  })
  await select(page, 0, 2, 5, 5)
  await page.keyboard.type(" new")
  const words = (await state(page)).segmentsByLang.en[0].words
  expect(words.at(-1).start).toBe(words.at(-1).end)
  await select(page, 0, words.length - 1, 0, 3)
  await expect(page.locator("#cut")).toBeDisabled()
  expect(await cuts(page)).toEqual([])
})

test("editing after a deletion keeps spaces and the exact existing cut ranges", async ({
  page,
}) => {
  await select(page, 0, 1, 0, 5)
  await page.keyboard.press("Backspace")
  await page.keyboard.type("nice")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("Hello nice world")
  expect(await cuts(page)).toEqual([])
})

test("a deleted word's timing anchor does not prevent joining neighboring words", async ({
  page,
}) => {
  await select(page, 0, 1, 0, 5)
  await page.keyboard.press("Backspace")
  await select(page, 0, 2, 0, 0)
  await page.keyboard.press("Backspace")
  await page.keyboard.press("Backspace")
  expect((await state(page)).segmentsByLang.en[0].text).toBe("Helloworld")
  expect(await cuts(page)).toEqual([])
})
