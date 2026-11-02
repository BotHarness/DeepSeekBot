export type MotionCommand = 'sit' | 'stand' | 'wander';
export type MotionPhase = 'standing' | 'walking' | 'sitting' | 'seated' | 'rising';
export const CHAIR = { x: 0.58, z: -0.15, approachZ: 0 };
const POINTS = [
  { x: -0.8, z: 0 },
  { x: 0.65, z: 0 },
];
const smooth = (x: number) => x * x * (3 - 2 * x);
export class RoomMotion {
  x = CHAIR.x;
  z = CHAIR.z;
  yaw = 0;
  seated = 1;
  stride = 0;
  phase: MotionPhase = 'seated';
  wandering = false;
  private target: { x: number; z: number } | undefined;
  private destination: 'chair' | 'floor' = 'chair';
  private transition = 1;
  private idle = 0;
  private point = 0;

  command(command: MotionCommand): void {
    if (command === 'wander') {
      this.wandering = !this.wandering;
      if (!this.wandering) {
        this.target = undefined;
        if (this.phase === 'walking') this.phase = 'standing';
        return;
      }
      this.destination = 'floor';
      this.idle = 3;
      if (this.seated > 0) this.phase = 'rising';
      return;
    }
    this.wandering = false;
    this.target = undefined;
    this.destination = command === 'sit' ? 'chair' : 'floor';
    if (command === 'sit') {
      if (this.seated > 0) {
        this.phase = 'sitting';
        return;
      }
      this.target = { x: CHAIR.x, z: CHAIR.approachZ };
      this.phase = 'walking';
    } else if (this.seated > 0) this.phase = 'rising';
    else this.phase = 'standing';
  }

  step(seconds: number, options: { enabled: boolean; idle: boolean; reduced: boolean }): void {
    const dt = Math.max(0, Math.min(seconds, 0.05));
    this.stride = 0;
    if (!options.enabled) {
      this.target = undefined;
      this.wandering = false;
      if (this.phase === 'walking') this.phase = 'standing';
      return;
    }
    if (options.reduced) {
      this.wandering = false;
      if (this.destination === 'chair' && this.phase !== 'standing') {
        this.x = CHAIR.x;
        this.z = CHAIR.z;
        this.yaw = 0;
        this.transition = 1;
        this.seated = 1;
        this.phase = 'seated';
      } else if (this.phase === 'rising') {
        this.z = CHAIR.approachZ;
        this.transition = 0;
        this.seated = 0;
        this.phase = 'standing';
      } else if (this.phase === 'walking') this.phase = 'standing';
      this.target = undefined;
      return;
    }
    if (this.phase === 'sitting' || this.phase === 'rising') {
      this.transition = Math.max(
        0,
        Math.min(1, this.transition + dt * (this.phase === 'sitting' ? 1 : -1)),
      );
      this.seated = smooth(this.transition);
      this.x = CHAIR.x;
      this.z = CHAIR.approachZ + (CHAIR.z - CHAIR.approachZ) * this.seated;
      this.yaw += Math.atan2(Math.sin(-this.yaw), Math.cos(-this.yaw)) * (1 - Math.exp(-dt * 10));
      if (this.transition === 1) this.phase = 'seated';
      if (this.transition === 0) this.phase = 'standing';
      return;
    }
    if (this.wandering && !options.idle) return;
    if (this.phase === 'standing' && this.wandering) {
      this.idle += dt;
      if (this.idle >= 3) {
        this.idle = 0;
        this.target = POINTS[this.point++ % POINTS.length];
        this.phase = 'walking';
      }
    }
    if (this.phase !== 'walking' || !this.target) return;
    const dx = this.target.x - this.x,
      dz = this.target.z - this.z;
    const distance = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const turn = Math.atan2(Math.sin(angle - this.yaw), Math.cos(angle - this.yaw));
    this.yaw += Math.sign(turn) * Math.min(Math.abs(turn), dt * 3.5);
    if (Math.abs(turn) > 0.2 && distance > 0.02) return;
    const travel = Math.min(distance, dt * 0.45);
    if (distance > 0) {
      this.x += (dx / distance) * travel;
      this.z += (dz / distance) * travel;
    }
    this.stride = dt > 0 ? travel / dt / 0.45 : 0;
    if (distance <= travel + 0.001) {
      this.target = undefined;
      this.phase = this.destination === 'chair' ? 'sitting' : 'standing';
    }
  }
}
