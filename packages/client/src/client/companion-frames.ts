export interface CompanionFrameTask {
  read(now: number): void;
  write(now: number): void;
}

export class CompanionFrames {
  private readonly tasks = new Set<CompanionFrameTask>();
  private frame = 0;

  start(task: CompanionFrameTask): void {
    this.tasks.add(task);
    if (!this.frame) this.frame = requestAnimationFrame(this.run);
  }

  stop(task: CompanionFrameTask): void {
    this.tasks.delete(task);
    if (this.tasks.size || !this.frame) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private readonly run = (now: number): void => {
    this.frame = 0;
    const current = [...this.tasks];
    for (const task of current) task.read(now);
    for (const task of current) if (this.tasks.has(task)) task.write(now);
    if (this.tasks.size && !this.frame) this.frame = requestAnimationFrame(this.run);
  };
}
