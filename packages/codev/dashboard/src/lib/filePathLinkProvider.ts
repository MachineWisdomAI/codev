/**
 * Custom xterm.js ILinkProvider for file paths in terminal output (Spec 0101).
 *
 * Detects file paths using FILE_PATH_REGEX and creates clickable links
 * with Cmd+Click (macOS) / Ctrl+Click (others) activation.
 *
 * FilePathDecorationManager provides persistent dotted underline decoration
 * via xterm.js registerDecoration API, so file paths are always visually
 * distinguished from surrounding text (not just on hover).
 */

import type { IDisposable, ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { FILE_PATH_REGEX, looksLikeFilePath } from './filePaths.js';

type FileOpenCallback = (path: string, line?: number, column?: number, terminalId?: string) => void;

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');

export class FilePathLinkProvider implements ILinkProvider {
  constructor(
    private terminal: Terminal,
    private onFileOpen: FileOpenCallback,
    private terminalId?: string,
  ) {}

  provideLinks(lineNumber: number, callback: (links: ILink[] | undefined) => void): void {
    const bufferLine = this.terminal.buffer.active.getLine(lineNumber - 1);
    if (!bufferLine) { callback(undefined); return; }
    const text = bufferLine.translateToString();

    // Create fresh regex each call to avoid /g lastIndex statefulness
    const regex = new RegExp(FILE_PATH_REGEX.source, FILE_PATH_REGEX.flags);
    const links: ILink[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      // FILE_PATH_REGEX capture groups:
      //   Group 1: file path (e.g., "src/foo.ts")
      //   Group 2: line number, colon format (e.g., "42" from ":42")
      //   Group 3: column number, colon format (e.g., "15" from ":15")
      //   Group 4: line number, paren format (e.g., "42" from "(42,15)")
      //   Group 5: column number, paren format (e.g., "15" from "(42,15)")
      const filePath = match[1];
      if (!filePath || !looksLikeFilePath(filePath)) continue;

      const line = match[2] ? parseInt(match[2], 10)
                 : match[4] ? parseInt(match[4], 10)
                 : undefined;
      const column = match[3] ? parseInt(match[3], 10)
                   : match[5] ? parseInt(match[5], 10)
                   : undefined;

      // Link range covers the file path + line/col suffix, excluding the
      // leading delimiter (space, quote, bracket, etc.) matched by the regex.
      const fullMatch = match[0];
      const capturedOffset = fullMatch.indexOf(filePath);
      const linkStart = match.index + capturedOffset;
      const linkEnd = match.index + fullMatch.length;

      // xterm.js ILink.range uses 1-based inclusive coordinates.
      // underline: false — persistent dotted underline is handled by FilePathDecorationManager
      // overlay elements, not xterm's built-in hover underline.
      links.push({
        range: {
          start: { x: linkStart + 1, y: lineNumber },
          end: { x: linkEnd, y: lineNumber },
        },
        text: fullMatch.substring(capturedOffset),
        decorations: { pointerCursor: true, underline: false },
        activate: (event: MouseEvent, _linkText: string) => {
          // Platform-aware modifier: Cmd on macOS, Ctrl on others
          if (isMac ? !event.metaKey : !event.ctrlKey) return;
          this.onFileOpen(filePath, line, column, this.terminalId);
        },
        // Toggle CSS class on hover for brightness shift on dotted underline overlays.
        hover: () => {
          this.terminal.element?.classList.add('file-path-link-hover');
        },
        leave: () => {
          this.terminal.element?.classList.remove('file-path-link-hover');
        },
      });
    }

    callback(links.length > 0 ? links : undefined);
  }
}

/**
 * Creates persistent dotted underline decorations for file paths in terminal output.
 *
 * Uses xterm.js registerDecoration API to overlay styled elements on detected file paths.
 * Listens for term.onWriteParsed to scan new lines as content arrives.
 * Decorations persist in the terminal (visible without hover), satisfying the spec's
 * requirement that file paths are "visually indicated as clickable."
 */
export class FilePathDecorationManager {
  private disposables: IDisposable[] = [];
  private lastScannedLine = -1;

  constructor(private terminal: Terminal) {
    this.disposables.push(
      terminal.onWriteParsed(() => this.scanNewLines()),
    );
  }

  private scanNewLines(): void {
    const buffer = this.terminal.buffer.active;
    const currentLine = buffer.baseY + buffer.cursorY;

    for (let i = this.lastScannedLine + 1; i <= currentLine; i++) {
      this.decorateLine(i);
    }
    this.lastScannedLine = currentLine;
  }

  private decorateLine(absoluteLine: number): void {
    const buffer = this.terminal.buffer.active;
    const line = buffer.getLine(absoluteLine);
    if (!line) return;

    const text = line.translateToString();
    const regex = new RegExp(FILE_PATH_REGEX.source, FILE_PATH_REGEX.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const filePath = match[1];
      if (!filePath || !looksLikeFilePath(filePath)) continue;

      const fullMatch = match[0];
      const capturedOffset = fullMatch.indexOf(filePath);
      const linkStart = match.index + capturedOffset;
      const linkWidth = fullMatch.length - capturedOffset;

      // Create marker at the buffer line position
      const cursorLine = buffer.baseY + buffer.cursorY;
      const offset = absoluteLine - cursorLine;
      const marker = this.terminal.registerMarker(offset);
      if (!marker || marker.line === -1) continue;

      const decoration = this.terminal.registerDecoration({
        marker,
        x: linkStart,
        width: linkWidth,
      });

      if (decoration) {
        decoration.onRender(el => {
          el.classList.add('file-path-decoration');
        });
        this.disposables.push(decoration);
      }
      this.disposables.push(marker);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.lastScannedLine = -1;
  }
}
