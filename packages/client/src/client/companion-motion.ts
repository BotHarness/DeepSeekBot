export interface CompanionPoint {
  x: number;
  y: number;
  width: number;
  tilt: number;
  squash: number;
  phase: 'rest' | 'drag' | 'fall' | 'land';
}

export interface CompanionInteraction {
  kind: 'grab' | 'drag' | 'throw' | 'land';
  strength: number;
}

export class CompanionMotion {
  point: CompanionPoint = { x: 0, y: 0, width: 0, tilt: 0, squash: 0, phase: 'rest' };
  private height = 0;
  private vx = 0;
  private vy = 0;
  private sampledAt = 0;
  private landing = 0;
  private tiltVelocity = 0;
  private tiltTarget = 0;
  private dragIdle = 0;
  private dragging = false;
  private landingFeedback = false;
  private dragFeedbackAt = -Infinity;
  private ground: (x: number) => number = () => 0;

  constructor(private readonly interaction?: (event: CompanionInteraction) => void) {}

  setGround(ground: (x: number) => number): void {
    this.ground = ground;
  }

  private groundAt(x: number): number {
    return Math.max(0, Math.min(this.height, this.ground(x)));
  }

  measure(width: number, height: number, position: number): CompanionPoint {
    this.height = Math.max(0, height - 120);
    this.vx = 0;
    this.vy = 0;
    this.landing = 0;
    this.dragging = false;
    this.landingFeedback = false;
    this.resetTilt();
    const x = this.clampX(position * Math.max(0, width - 104), width);
    return (this.point = {
      x,
      y: this.groundAt(x),
      width,
      tilt: 0,
      squash: 0,
      phase: 'rest',
    });
  }

  drop(): CompanionPoint {
    this.vx = 0;
    this.vy = 0;
    this.landing = 0;
    this.landingFeedback = true;
    return (this.point = { ...this.point, y: this.height, squash: 0, phase: 'fall' });
  }

  resize(width: number, height: number): CompanionPoint {
    this.height = Math.max(0, height - 120);
    const x = this.clampX(this.point.x, width);
    const y = Math.min(this.height, this.point.y);
    if (x !== this.point.x) this.vx = 0;
    if (y !== this.point.y && this.vy > 0) this.vy = 0;
    return (this.point = { ...this.point, width, x, y });
  }

  drag(x: number, y: number, now: number, reduced: boolean): CompanionPoint {
    const nextX = this.clampX(x);
    const nextY = Math.max(0, Math.min(this.height, y));
    if (this.point.phase === 'drag') {
      const seconds = Math.max(0.016, (now - this.sampledAt) / 1000);
      this.vx = Math.max(-700, Math.min(700, (nextX - this.point.x) / seconds));
      this.vy = Math.max(-900, Math.min(900, (nextY - this.point.y) / seconds));
    } else {
      this.vx = 0;
      this.vy = 0;
    }
    this.sampledAt = now;
    this.landing = 0;
    this.dragIdle = 0;
    this.tiltTarget = reduced ? 0 : Math.max(-18, Math.min(18, this.vx / 35));
    if (!reduced) {
      if (!this.dragging) this.interaction?.({ kind: 'grab', strength: 1 });
      else if (Math.abs(this.vx) > 500 && now - this.dragFeedbackAt >= 500) {
        this.interaction?.({ kind: 'drag', strength: Math.min(1, Math.abs(this.vx) / 700) });
        this.dragFeedbackAt = now;
      }
    }
    this.dragging = true;
    if (reduced) this.resetTilt();
    return (this.point = {
      ...this.point,
      x: nextX,
      y: nextY,
      tilt: reduced ? 0 : this.point.tilt,
      squash: reduced ? 0 : -0.055,
      phase: 'drag',
    });
  }

  grab(now: number, reduced: boolean): CompanionPoint {
    this.vx = 0;
    this.vy = 0;
    this.sampledAt = now;
    this.dragIdle = 0;
    this.dragging = false;
    this.landingFeedback = false;
    this.dragFeedbackAt = -Infinity;
    this.tiltTarget = 0;
    if (reduced) this.resetTilt();
    return (this.point = {
      ...this.point,
      tilt: reduced ? 0 : this.point.tilt,
      squash: reduced ? 0 : -0.055,
      phase: 'drag',
    });
  }

  release(now: number, reduced: boolean, cancelled = false): CompanionPoint {
    if (cancelled || now - this.sampledAt > 120) {
      this.vx = 0;
      this.vy = 0;
    }
    if (reduced) return this.measure(this.point.width, this.height + 120, this.position());
    this.landingFeedback = this.dragging && !cancelled;
    if (this.landingFeedback && Math.hypot(this.vx, this.vy) >= 700)
      this.interaction?.({ kind: 'throw', strength: 1 });
    return (this.point = { ...this.point, phase: 'fall' });
  }

  advance(
    milliseconds: number,
    reduced: boolean,
    walking: boolean,
    direction: number,
  ): CompanionPoint {
    if (reduced) {
      this.resetTilt();
      if (this.point.phase === 'drag') return (this.point = { ...this.point, tilt: 0, squash: 0 });
      if (this.point.phase !== 'rest')
        return this.measure(this.point.width, this.height + 120, this.position());
      const floor = this.groundAt(this.point.x);
      if (this.point.tilt || this.point.squash || this.point.y !== floor)
        return (this.point = { ...this.point, y: floor, tilt: 0, squash: 0 });
      return this.point;
    }
    const limit = this.point.phase === 'fall' || this.point.phase === 'land' ? 2000 : 64;
    let remaining = Number.isFinite(milliseconds) ? Math.min(limit, Math.max(0, milliseconds)) : 0;
    let { x, y, tilt, squash, phase } = this.point;
    while (remaining > 0) {
      const dt = Math.min(8, remaining) / 1000;
      remaining -= dt * 1000;
      let target = 0;
      if (phase === 'drag') {
        this.dragIdle += dt * 1000;
        target = this.dragIdle > 80 ? 0 : this.tiltTarget;
      } else if (phase === 'fall') {
        this.vy -= 1900 * dt;
        this.vx *= Math.exp(-2.5 * dt);
        x += this.vx * dt;
        y += this.vy * dt;
        if (x < 8 || x > Math.max(8, this.point.width - 104)) {
          x = this.clampX(x);
          this.vx *= -0.25;
        }
        if (y >= this.height && this.vy > 0) {
          y = this.height;
          this.vy *= -0.2;
        }
        const floor = this.groundAt(x);
        if (y <= floor) {
          y = floor;
          const impact = Math.abs(this.vy);
          if (this.landingFeedback) {
            this.landingFeedback = false;
            this.interaction?.({ kind: 'land', strength: Math.min(1, impact / 1200) });
          }
          this.vy = impact > 100 ? impact * 0.24 : 0;
          squash = Math.min(0.12, impact / 9000);
          if (!this.vy) {
            phase = 'land';
            this.landing = 220;
          }
        }
        target = Math.max(-18, Math.min(18, this.vx / 45));
        squash *= Math.exp(-12 * dt);
      } else if (phase === 'land') {
        this.vx *= Math.exp(-16 * dt);
        x = this.clampX(x + this.vx * dt);
        y = this.groundAt(x);
        squash *= Math.exp(-18 * dt);
        this.landing -= dt * 1000;
        if (this.landing <= 0) {
          phase = 'rest';
          squash = 0;
          this.vx = 0;
        }
      } else {
        if (walking) x = this.clampX(x + direction * 18 * dt);
        const floor = this.groundAt(x);
        if (y !== floor) y = y < floor ? floor : Math.max(floor, y - 480 * dt);
      }
      this.tiltVelocity += (90 * (target - tilt) - 9 * this.tiltVelocity) * dt;
      tilt += this.tiltVelocity * dt;
      if (Math.abs(tilt) > 24) {
        tilt = Math.max(-24, Math.min(24, tilt));
        if (tilt * this.tiltVelocity > 0) this.tiltVelocity = 0;
      }
      if (target === 0 && Math.abs(tilt) < 0.015 && Math.abs(this.tiltVelocity) < 0.03) {
        tilt = 0;
        this.tiltVelocity = 0;
      }
    }
    if (
      x === this.point.x &&
      y === this.point.y &&
      tilt === this.point.tilt &&
      squash === this.point.squash &&
      phase === this.point.phase
    )
      return this.point;
    return (this.point = { ...this.point, x, y, tilt, squash, phase });
  }

  move(x: number): CompanionPoint {
    this.vx = 0;
    this.vy = 0;
    this.dragging = false;
    this.landingFeedback = false;
    this.resetTilt();
    return (this.point = {
      ...this.point,
      x: this.clampX(x),
      y: this.groundAt(this.clampX(x)),
      tilt: 0,
      squash: 0,
      phase: 'rest',
    });
  }

  position(): number {
    return this.point.x / Math.max(1, this.point.width - 104);
  }

  private clampX(x: number, width = this.point.width): number {
    return Math.max(8, Math.min(Math.max(8, width - 104), x));
  }
  private resetTilt(): void {
    this.tiltVelocity = 0;
    this.tiltTarget = 0;
    this.dragIdle = 0;
  }
}
