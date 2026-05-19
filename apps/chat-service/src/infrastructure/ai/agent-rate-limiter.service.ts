import { Injectable } from "@nestjs/common";

@Injectable()
export class AgentRateLimiterService {
  private readonly lastCallAt = new Map<string, number>();
  private readonly windowMs = 10_000;

  check(userId: string): { allowed: boolean; secondsRemaining?: number } {
    const now = Date.now();
    const last = this.lastCallAt.get(userId);
    if (last !== undefined) {
      const elapsed = now - last;
      if (elapsed < this.windowMs) {
        const secondsRemaining = Math.ceil((this.windowMs - elapsed) / 1000);
        return { allowed: false, secondsRemaining };
      }
    }
    this.lastCallAt.set(userId, now);
    return { allowed: true };
  }
}
