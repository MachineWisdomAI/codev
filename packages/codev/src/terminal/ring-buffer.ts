/**
 * Fixed-size circular buffer for storing terminal output lines.
 * Used for reconnection replay — stores last N lines in memory.
 */

export class RingBuffer {
  private buffer: string[];
  private head: number = 0;
  private count: number = 0;
  private seq: number = 0; // monotonically increasing sequence number
  private partial: string = ''; // incomplete line from previous pushData call

  constructor(private readonly capacity: number = 1000) {
    this.buffer = new Array(capacity);
  }

  /** Push a complete line into the buffer. Returns the assigned sequence number. */
  push(line: string): number {
    const index = (this.head + this.count) % this.capacity;
    this.buffer[index] = line;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
    return ++this.seq;
  }

  /**
   * Push raw data, splitting on newlines. Handles partial lines across
   * chunk boundaries: if data doesn't end with \n, the trailing fragment
   * is held and prepended to the next pushData call.
   *
   * Returns last sequence number.
   */
  pushData(data: string): number {
    const combined = this.partial + data;
    const parts = combined.split('\n');

    // Last element is either:
    // - "" if data ended with \n (all lines complete)
    // - non-empty if data ended mid-line (incomplete line)
    // Either way, save it as the new partial.
    this.partial = parts.pop()!;

    let lastSeq = this.seq;
    for (const line of parts) {
      lastSeq = this.push(line);
    }
    return lastSeq;
  }

  /** Get all stored lines in order, including any incomplete trailing line. */
  getAll(): string[] {
    const result: string[] = [];
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(this.head + i) % this.capacity]);
    }
    if (this.partial) {
      result.push(this.partial);
    }
    return result;
  }

  /** Get lines starting from a given sequence number (for resume). */
  getSince(sinceSeq: number): string[] {
    const linesAvailable = this.count;
    const oldestSeq = this.seq - linesAvailable + 1;
    const startSeq = Math.max(sinceSeq + 1, oldestSeq);
    if (startSeq > this.seq) return [];

    const skip = startSeq - oldestSeq;
    const result: string[] = [];
    for (let i = skip; i < this.count; i++) {
      result.push(this.buffer[(this.head + i) % this.capacity]);
    }
    if (this.partial) {
      result.push(this.partial);
    }
    return result;
  }

  /** Current sequence number (last written). */
  get currentSeq(): number {
    return this.seq;
  }

  /** Number of lines currently stored. */
  get size(): number {
    return this.count;
  }

  /** Clear the buffer and release memory. */
  clear(): void {
    this.buffer = [];
    this.head = 0;
    this.count = 0;
    this.partial = '';
    // Don't reset seq — it should be monotonic
  }
}
