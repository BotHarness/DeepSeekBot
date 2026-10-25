import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

export interface ScrollMotion {
  update(
    input: { x: number; y: number; vx: number; vy: number },
    allowed: () => void,
  ): Promise<void>;
  stop(): Promise<void>;
}

const program = `
ObjC.import('Foundation'); ObjC.import('ApplicationServices');
const output = $.NSFileHandle.fileHandleWithStandardOutput;
function emit(value) { output.writeData($(JSON.stringify(value)+'\\n').dataUsingEncoding($.NSUTF8StringEncoding)); }
if (!$.AXIsProcessTrusted()) { emit({error:'accessibility-required'}); throw Error('accessibility-required'); }
emit({ready:true});
const input = $.NSFileHandle.fileHandleWithStandardInput;
let buffer = '';
while (true) {
 const data = input.availableData; if (data.length === 0) break;
 buffer += ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data,$.NSUTF8StringEncoding));
 if (buffer.length > 4096) break;
 let end;
 while ((end=buffer.indexOf('\\n')) >= 0) {
  const line=buffer.slice(0,end); buffer=buffer.slice(end+1);
  const p=JSON.parse(line);
  if (![p.x,p.y,p.dx,p.dy,p.until].every(Number.isFinite) || Math.abs(p.dx)>16 || Math.abs(p.dy)>16) throw Error('invalid-frame');
  if (Date.now() <= p.until && p.until-Date.now() <= 64) {
   const e=$.CGEventCreateScrollWheelEvent(null,0,2,-p.dy,-p.dx);
   $.CGEventSetLocation(e,{x:p.x,y:p.y});
   $.CGEventSetIntegerValueField(e,88,1);
   $.CGEventPost(0,e);
  }
  emit({ack:true});
 }
}
`;

export function createMacScroll(onEvent: (message: string) => void = () => {}): ScrollMotion {
  let child: ChildProcessWithoutNullStreams | undefined;
  let opening: Promise<void> | undefined;
  const exits = new Set<Promise<void>>();
  let cancelOpening: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let epoch = 0;
  let pending = false;
  let motion:
    | { x: number; y: number; vx: number; vy: number; until: number; allowed: () => void }
    | undefined;
  let last = 0;
  let remainderX = 0;
  let remainderY = 0;
  const stop = (): Promise<void> => {
    epoch++;
    motion = undefined;
    clearInterval(timer);
    timer = undefined;
    cancelOpening?.();
    cancelOpening = undefined;
    opening = undefined;
    const old = child;
    child = undefined;
    if (old !== undefined) {
      old.stdin.destroy();
      old.kill('SIGTERM');
      onEvent('phase=scroll-native-stop');
    }
    return Promise.all([...exits]).then(() => undefined);
  };
  const open = (): Promise<void> => {
    if (opening !== undefined) return opening;
    const current = spawn('/usr/bin/osascript', ['-l', 'JavaScript', '-e', program], {
      stdio: 'pipe',
    });
    child = current;
    pending = false;
    remainderX = remainderY = 0;
    const exited = new Promise<void>((resolve) =>
      current.once('close', () => {
        if (child === current) void stop();
        resolve();
      }),
    );
    exits.add(exited);
    void exited.finally(() => exits.delete(exited));
    current.stderr.resume();
    current.stdin.on('error', () => {
      if (child === current) void stop();
    });
    onEvent('phase=scroll-native-start');
    opening = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (child === current) void stop();
        reject(new Error('Native scrolling did not start.'));
      }, 2000);
      cancelOpening = () => {
        clearTimeout(timeout);
        reject(new Error('Scrolling was cancelled.'));
      };
      current.once('error', () => {
        clearTimeout(timeout);
        reject(new Error('Native scrolling could not start.'));
      });
      current.once('close', () => {
        clearTimeout(timeout);
        reject(new Error('Native scrolling stopped.'));
      });
      createInterface({ input: current.stdout }).on('line', (line) => {
        if (child !== current) return;
        try {
          const reply = JSON.parse(line) as { ready?: boolean; ack?: boolean; error?: string };
          if (reply.ready === true) {
            clearTimeout(timeout);
            cancelOpening = undefined;
            resolve();
          }
          if (reply.ack === true) pending = false;
          if (reply.error !== undefined) {
            clearTimeout(timeout);
            void stop();
            reject(new Error('Allow accessibility access for the Host before scrolling.'));
          }
        } catch {
          void stop();
        }
      });
    });
    return opening;
  };
  return {
    async update(input, allowed) {
      if (input.vx === 0 && input.vy === 0) {
        await stop();
        return;
      }
      const version = epoch;
      await open();
      if (epoch !== version) throw new Error('Scrolling was cancelled.');
      allowed();
      motion = { ...input, until: Date.now() + 250, allowed };
      if (timer !== undefined) return;
      last = Date.now();
      timer = setInterval(() => {
        const now = Date.now();
        const active = motion;
        if (active === undefined || now >= active.until) {
          void stop();
          return;
        }
        try {
          active.allowed();
        } catch {
          void stop();
          return;
        }
        const elapsed = Math.min(32, now - last);
        last = now;
        if (pending || child === undefined) return;
        remainderX += (active.vx * elapsed) / 1000;
        remainderY += (active.vy * elapsed) / 1000;
        const dx = Math.trunc(remainderX),
          dy = Math.trunc(remainderY);
        remainderX -= dx;
        remainderY -= dy;
        if (dx === 0 && dy === 0) return;
        pending = true;
        child.stdin.write(
          JSON.stringify({ x: active.x, y: active.y, dx, dy, until: now + 32 }) + '\n',
        );
      }, 16);
    },
    stop,
  };
}
