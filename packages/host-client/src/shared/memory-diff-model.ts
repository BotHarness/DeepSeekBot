export type MemoryDiffLine =
  | { kind: 'hunk'; text: string }
  | { kind: 'note'; text: string }
  | {
      kind: 'context' | 'add' | 'remove';
      oldLine?: number;
      newLine?: number;
      text: string;
    };

export interface MemoryDiffModel {
  lines: MemoryDiffLine[];
  binary: boolean;
}

export function parseMemoryDiff(diff: string): MemoryDiffModel {
  const lines: MemoryDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  let binary = false;

  for (const line of diff.replace(/\r\n/gu, '\n').split('\n')) {
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/u.exec(line);
    if (hunk !== null) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[3]);
      inHunk = true;
      lines.push({ kind: 'hunk', text: line });
      continue;
    }
    if (/^(?:Binary files .+ differ|GIT binary patch)$/u.test(line)) {
      binary = true;
      inHunk = false;
      continue;
    }
    if (line.startsWith('\\ No newline at end of file')) {
      if (inHunk) lines.push({ kind: 'note', text: line.slice(2) });
      continue;
    }
    if (!inHunk) continue;
    const marker = line[0];
    if (marker === ' ') {
      lines.push({ kind: 'context', oldLine: oldLine++, newLine: newLine++, text: line.slice(1) });
    } else if (marker === '+') {
      lines.push({ kind: 'add', newLine: newLine++, text: line.slice(1) });
    } else if (marker === '-') {
      lines.push({ kind: 'remove', oldLine: oldLine++, text: line.slice(1) });
    } else {
      inHunk = false;
    }
  }

  return { lines, binary };
}
