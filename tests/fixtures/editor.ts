import { createTranscriptEditor } from "../../src/scripts/transcriptEditor"
import { createEditorHistory } from "../../src/scripts/editorHistory"
import {
  cutRangesFromSegments,
  segmentsThroughCuts,
} from "../../src/scripts/cuts"
import { buildSrt, type SubtitleSegment } from "../../src/scripts/subtitles"
import "../../src/styles/global.css"
import "../../src/styles/app.css"

const initial: SubtitleSegment[] = [
  {
    start: 0,
    end: 3,
    text: "Hello brave world",
    words: [
      { start: 0, end: 0.8, text: "Hello" },
      { start: 1, end: 1.8, text: "brave" },
      { start: 2, end: 2.8, text: "world" },
    ],
  },
  {
    start: 3,
    end: 6,
    text: "This is fine",
    words: [
      { start: 3, end: 3.8, text: "This" },
      { start: 4, end: 4.8, text: "is" },
      { start: 5, end: 5.8, text: "fine" },
    ],
  },
]
let state = {
  activeLang: "en",
  orderedLangs: ["en", "es"],
  segmentsByLang: {
    en: structuredClone(initial),
    es: [{ start: 0, end: 3, text: "Hola mundo" }],
  } as Record<string, SubtitleSegment[]>,
}
const root = document.querySelector<HTMLElement>("#transcript")!
const cuts = () => cutRangesFromSegments(state.segmentsByLang.en)
const history = createEditorHistory({
  getState: () => state,
  restoreState: (next) => {
    state = next
  },
  refreshButtons: () => {},
  onRestore: () => editor.render(),
})
const editor = createTranscriptEditor({
  root,
  cutButton: document.querySelector<HTMLButtonElement>("#cut")!,
  tt: (key) => key,
  segmentsFor: (lang) => state.segmentsByLang[lang],
  activeLang: () => state.activeLang,
  sourceLang: () => "en",
  cutRanges: cuts,
  snapshotSegments: history.snapshotSegments,
  pushHistory: history.pushHistory,
  undo: history.undo,
  redo: history.redo,
  seek: () => {},
  onTextChange: () => {},
  onStructureChange: () => {},
})
document.querySelector("#undo")!.addEventListener("click", () => {
  editor.commitPendingEdit()
  history.undo()
})
document.querySelector("#redo")!.addEventListener("click", () => {
  editor.commitPendingEdit()
  history.redo()
})
document.querySelector("#translate")!.addEventListener("click", () => {
  editor.commitPendingEdit()
  state.activeLang = state.activeLang === "en" ? "es" : "en"
  editor.render()
})
Object.assign(window, {
  fixture: {
    state: () => state,
    cuts,
    srt: () => buildSrt(segmentsThroughCuts(state.segmentsByLang.en, cuts())),
    reset: (segments = initial) => {
      editor.commitPendingEdit()
      state.segmentsByLang.en = structuredClone(segments)
      state.activeLang = "en"
      history.resetHistory()
      editor.render()
    },
  },
})
editor.render()
