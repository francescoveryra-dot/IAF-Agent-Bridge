const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export class ReplyCollector {
  private chunks: string[] = [];
  private discarded = "";
  private readonly active = new Set<string>();
  private sawTool = false;
  private afterTools = false;

  pushMessage(text: string): void {
    if (!text) return;
    if (this.sawTool && !(this.afterTools && this.active.size === 0)) return;
    this.chunks.push(text);
  }

  noteTool(id: string | undefined, status: string | undefined): void {
    const terminal = status !== undefined && TERMINAL.has(status);
    if (!this.sawTool) {
      this.discarded = this.chunks.join("");
      this.chunks = [];
      this.sawTool = true;
    }
    if (id && !terminal) this.active.add(id);
    if (terminal) {
      if (id) this.active.delete(id);
      if (this.active.size === 0) {
        this.chunks = [];
        this.afterTools = true;
      }
    }
  }

  finish(): { result: string; resultSource?: "pre-tool-fallback" } {
    const current = this.chunks.join("");
    if (current) return { result: current };
    if (this.discarded) return { result: this.discarded, resultSource: "pre-tool-fallback" };
    return { result: "" };
  }
}
