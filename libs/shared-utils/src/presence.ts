export function presenceKey(userId: string): string {
  return `presence:v2:${userId}`;
}
