"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import type { Text } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  tooltips,
} from "@codemirror/view";
import { yaml } from "@codemirror/lang-yaml";
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { linter, lintGutter, lintKeymap, type Diagnostic } from "@codemirror/lint";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { tags } from "@lezer/highlight";
import { getYamlSyntaxIssues, type YamlSyntaxIssue } from "@/lib/customTheme";

type Props = {
  value: string;
  onChange: (next: string) => void;
  schemaErrors?: { field: string; message: string }[];
  /** Minimum editor content height (default 320px; use a taller value in sidebar layout). */
  minEditorHeight?: string;
  className?: string;
};

const yamlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" },
  { tag: tags.string, color: "#c3e88d" },
  { tag: tags.number, color: "#f78c6c" },
  { tag: tags.bool, color: "#ff5370" },
  { tag: tags.null, color: "#ff5370" },
  { tag: tags.comment, color: "#546e7a", fontStyle: "italic" },
  { tag: tags.propertyName, color: "#82aaff" },
  { tag: tags.separator, color: "#89ddff" },
  { tag: tags.punctuation, color: "#89ddff" },
  { tag: tags.documentMeta, color: "#c792ea" },
]);

const editorTheme = (minHeight: string) =>
  EditorView.theme({
  "&": {
    fontSize: "13px",
    border: "1px solid var(--kurator-border)",
    borderRadius: "0.75rem",
    backgroundColor: "var(--kurator-bg)",
  },
  "&.cm-focused": {
    outline: "2px solid var(--kurator-accent)",
    outlineOffset: "1px",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    overflow: "auto",
  },
  ".cm-content": {
    color: "var(--kurator-fg)",
    caretColor: "var(--kurator-accent)",
    minHeight,
    padding: "0.75rem 0",
  },
  ".cm-gutters": {
    backgroundColor: "var(--kurator-surface)",
    color: "var(--kurator-muted)",
    borderRight: "1px solid var(--kurator-border)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--kurator-accent) 8%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--kurator-accent) 12%, transparent)",
  },
  ".cm-gutter-lint": {
    width: "1.1rem",
  },
  ".cm-lint-marker-error": {
    content: '""',
    display: "inline-block",
    width: "0.55rem",
    height: "0.55rem",
    borderRadius: "9999px",
    backgroundColor: "#f87171",
  },
  ".cm-lint-marker-warning": {
    content: '""',
    display: "inline-block",
    width: "0.55rem",
    height: "0.55rem",
    borderRadius: "9999px",
    backgroundColor: "#fbbf24",
  },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    borderBottom: "2px wavy #f87171",
    backgroundColor: "color-mix(in srgb, #f87171 8%, transparent)",
    cursor: "help",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    borderBottom: "2px wavy #fbbf24",
    backgroundColor: "color-mix(in srgb, #fbbf24 8%, transparent)",
    cursor: "help",
  },
  ".cm-tooltip.cm-tooltip-lint": {
    backgroundColor: "var(--kurator-surface)",
    border: "1px solid var(--kurator-border)",
    color: "var(--kurator-fg)",
    borderRadius: "0.5rem",
    padding: "0.35rem 0.6rem",
    fontSize: "12px",
    lineHeight: "1.4",
    maxWidth: "22rem",
    boxShadow: "0 4px 14px rgb(0 0 0 / 0.25)",
    zIndex: "100",
  },
  ".cm-tooltip.cm-tooltip-lint .cm-diagnostic": {
    padding: 0,
  },
  ".cm-tooltip.cm-tooltip-lint .cm-diagnosticText": {
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  },
});

/** Span the full source line so underline + hover tooltip cover the whole row. */
function issueToDiagnostic(doc: Text, issue: YamlSyntaxIssue): Diagnostic {
  const lineNo = Math.min(Math.max(1, issue.line), doc.lines);
  const line = doc.line(lineNo);
  return {
    from: line.from,
    to: line.to,
    severity: issue.severity,
    message: issue.message,
  };
}

function yamlSyntaxLinter() {
  return linter(
    (view): Diagnostic[] => {
      const text = view.state.doc.toString();
      return getYamlSyntaxIssues(text).map((issue) => issueToDiagnostic(view.state.doc, issue));
    },
    { delay: 200, tooltipFilter: () => true },
  );
}

function buildExtensions(
  onDocChange: (text: string) => void,
  minEditorHeight: string,
  tooltipParent?: HTMLElement,
): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    bracketMatching(),
    foldGutter(),
    yaml(),
    syntaxHighlighting(yamlHighlightStyle),
    lintGutter(),
    yamlSyntaxLinter(),
    tooltips({
      parent: tooltipParent ?? (typeof document !== "undefined" ? document.body : undefined),
      hoverTime: 200,
    }),
    EditorView.lineWrapping,
    EditorView.editable.of(true),
    keymap.of([...defaultKeymap, ...historyKeymap, ...lintKeymap, indentWithTab]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onDocChange(update.state.doc.toString());
      }
    }),
    editorTheme(minEditorHeight),
  ];
}

function syntaxStatusLabel(issues: YamlSyntaxIssue[]): { tone: "ok" | "warn" | "bad"; text: string } {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  if (errors > 0) {
    return {
      tone: "bad",
      text: errors === 1 ? "1 syntax error — hover underlined line" : `${errors} syntax errors — hover underlined lines`,
    };
  }
  if (warnings > 0) {
    return {
      tone: "warn",
      text: warnings === 1 ? "1 syntax warning — hover underlined line" : `${warnings} syntax warnings — hover underlined lines`,
    };
  }
  return { tone: "ok", text: "Valid YAML syntax" };
}

export function CustomThemeYamlEditor({
  value,
  onChange,
  schemaErrors,
  minEditorHeight = "320px",
  className = "",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const applyingExternalRef = useRef(false);
  const lastEmittedRef = useRef(value);
  const [liveValue, setLiveValue] = useState(value);

  onChangeRef.current = onChange;

  const syntaxIssues = useMemo(() => getYamlSyntaxIssues(liveValue), [liveValue]);
  const syntaxStatus = useMemo(() => syntaxStatusLabel(syntaxIssues), [syntaxIssues]);

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: buildExtensions(
          (text) => {
            if (applyingExternalRef.current) return;
            lastEmittedRef.current = text;
            setLiveValue(text);
            onChangeRef.current(text);
          },
          minEditorHeight,
          wrapperRef.current ?? undefined,
        ),
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    lastEmittedRef.current = value;
    setLiveValue(value);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    if (value === lastEmittedRef.current) {
      return;
    }

    const current = view.state.doc.toString();
    if (current === value) {
      lastEmittedRef.current = value;
      setLiveValue(value);
      return;
    }

    applyingExternalRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
    applyingExternalRef.current = false;
    lastEmittedRef.current = value;
    setLiveValue(value);
  }, [value]);

  const statusToneClass =
    syntaxStatus.tone === "ok"
      ? "text-emerald-400"
      : syntaxStatus.tone === "warn"
        ? "text-amber-400"
        : "text-red-400";

  return (
    <div className={`space-y-2 ${className}`.trim()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="kurator-panel-title text-kurator-fg">YAML Editor</h2>
        <p className={`text-xs ${statusToneClass}`} role="status" aria-live="polite">
          {syntaxStatus.text}
        </p>
      </div>
      <div
        ref={wrapperRef}
        className="overflow-hidden rounded-xl"
        aria-label="Custom theme YAML editor"
      >
        <div ref={hostRef} />
      </div>
      {schemaErrors && schemaErrors.length > 0 ? (
        <ul className="space-y-1 rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
          {schemaErrors.map((e) => (
            <li key={`${e.field}:${e.message}`}>
              <span className="font-mono text-xs text-red-300">{e.field}</span>: {e.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
