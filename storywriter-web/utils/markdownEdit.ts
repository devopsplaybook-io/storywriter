// Pure selection-math helpers for the markdown editor. They take the current
// textarea value and selection, and return the new value plus where the
// selection should end up — no DOM access, so they are unit-testable.

export interface EditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function wrapSelection(
  value: string,
  selStart: number,
  selEnd: number,
  before: string,
  after: string = before,
): EditResult {
  const selected = value.slice(selStart, selEnd);
  // Idempotent: selecting exactly "before…after" unwraps it
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(
      before.length,
      selected.length - after.length,
    );
    return {
      value: value.slice(0, selStart) + inner + value.slice(selEnd),
      selectionStart: selStart,
      selectionEnd: selStart + inner.length,
    };
  }
  const next = value.slice(0, selStart) + before + selected + after + value.slice(selEnd);
  return {
    value: next,
    selectionStart: selStart + before.length,
    selectionEnd: selStart + before.length + selected.length,
  };
}

export function insertLink(
  value: string,
  selStart: number,
  selEnd: number,
): EditResult {
  const selected = value.slice(selStart, selEnd);
  const link = `[${selected || "text"}](url)`;
  const next = value.slice(0, selStart) + link + value.slice(selEnd);
  if (selected) {
    // Select the url placeholder so typing replaces it
    const urlStart = selStart + link.length - 4;
    return { value: next, selectionStart: urlStart, selectionEnd: urlStart + 3 };
  }
  // Select "text" placeholder
  const textStart = selStart + 1;
  return {
    value: next,
    selectionStart: textStart,
    selectionEnd: textStart + 4,
  };
}

export function insertPrefix(
  value: string,
  selStart: number,
  selEnd: number,
  prefix: string,
): EditResult {
  const lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  // Idempotent: the line already starts with the prefix → remove it
  if (value.slice(lineStart, lineStart + prefix.length) === prefix) {
    const next =
      value.slice(0, lineStart) + value.slice(lineStart + prefix.length);
    return {
      value: next,
      selectionStart: Math.max(lineStart, selStart - prefix.length),
      selectionEnd: Math.max(lineStart, selEnd - prefix.length),
    };
  }
  const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  const shift = prefix.length;
  return {
    value: next,
    selectionStart: selStart + shift,
    selectionEnd: selEnd + shift,
  };
}

// Insert text at the caret (replacing the selection, if any) and place the
// caret after the inserted text — used by the AI action "insert" flow.
export function insertTextAtCursor(
  value: string,
  selStart: number,
  selEnd: number,
  text: string,
): EditResult {
  const next = value.slice(0, selStart) + text + value.slice(selEnd);
  const cursor = selStart + text.length;
  return {
    value: next,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}
