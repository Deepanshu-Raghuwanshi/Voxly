import { Injectable } from "@nestjs/common";

interface UserRecord {
  lastCallAt: number;
  hourlyCount: number;
  hourWindowStart: number;
}

@Injectable()
export class PersonaRateLimiterService {
  private readonly records = new Map<string, UserRecord>();
  private readonly cooldownMs = 5_000;
  private readonly maxPerHour = 20;
  private readonly hourMs = 60 * 60 * 1000;

  check(userId: string): {
    allowed: boolean;
    secondsRemaining?: number;
    reason?: "cooldown" | "hourly";
  } {
    const now = Date.now();
    const rec = this.records.get(userId) ?? {
      lastCallAt: 0,
      hourlyCount: 0,
      hourWindowStart: now,
    };

    // Reset hourly window if expired
    if (now - rec.hourWindowStart >= this.hourMs) {
      rec.hourlyCount = 0;
      rec.hourWindowStart = now;
    }

    // Per-message cooldown check
    if (rec.lastCallAt > 0 && now - rec.lastCallAt < this.cooldownMs) {
      const secondsRemaining = Math.ceil(
        (this.cooldownMs - (now - rec.lastCallAt)) / 1000,
      );
      return { allowed: false, secondsRemaining, reason: "cooldown" };
    }

    // Hourly cap check
    if (rec.hourlyCount >= this.maxPerHour) {
      const secondsRemaining = Math.ceil(
        (this.hourMs - (now - rec.hourWindowStart)) / 1000,
      );
      return { allowed: false, secondsRemaining, reason: "hourly" };
    }

    // Allow — update record
    rec.lastCallAt = now;
    rec.hourlyCount += 1;
    this.records.set(userId, rec);
    return { allowed: true };
  }
}
