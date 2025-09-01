export interface TraceLogger {
  log: (line: string) => void;
  getLines: () => string[];
}

class MemoryTrace implements TraceLogger {
  private lines: string[] = [];
  log(line: string) {
    this.lines.push(line);
  }
  getLines() {
    return this.lines.slice();
  }
}

export function createMemoryTrace(): TraceLogger {
  return new MemoryTrace();
}

