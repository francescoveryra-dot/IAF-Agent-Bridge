const RESULT_CAP = 400_000;

export class ReplyCollector {
  private chunks: string[] = [];
  private length = 0;

  pushMessage(text: string): void {
    if (!text || this.length >= RESULT_CAP) return;
    const slice = text.length > RESULT_CAP - this.length ? text.slice(0, RESULT_CAP - this.length) : text;
    this.chunks.push(slice);
    this.length += slice.length;
  }

  finish(): { result: string } {
    return { result: this.chunks.join("") };
  }
}
