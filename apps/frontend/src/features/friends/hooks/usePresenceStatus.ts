import { useEffect } from "react";
import { create } from "zustand";
import { friendsService } from "../services/friends.service";

interface PresenceValue {
  isOnline?: boolean;
}

interface PresenceState {
  users: Map<string, PresenceValue>;
}

const presenceStore = create<PresenceState>(() => ({ users: new Map() }));
const observers = new Map<string, number>();
const BATCH_SIZE = 100;

export function usePresenceStatus(
  userId: string | undefined,
  initialStatus: boolean | undefined,
): boolean | undefined {
  const liveStatus = presenceStore((state) =>
    userId ? state.users.get(userId)?.isOnline : undefined,
  );

  useEffect(() => {
    if (!userId) return;
    const count = observers.get(userId) ?? 0;
    observers.set(userId, count + 1);
    if (count === 0) {
      presenceStore.setState(({ users }) => ({
        users: new Map(users).set(userId, {}),
      }));
    }

    return () => {
      const remaining = (observers.get(userId) ?? 1) - 1;
      if (remaining > 0) {
        observers.set(userId, remaining);
        return;
      }
      observers.delete(userId);
      presenceStore.setState(({ users }) => {
        const next = new Map(users);
        next.delete(userId);
        return { users: next };
      });
    };
  }, [userId]);

  return liveStatus ?? initialStatus;
}

export function onPresenceUsersAdded(callback: () => void): () => void {
  return presenceStore.subscribe((state, previous) => {
    if (state.users.size > previous.users.size) callback();
  });
}

export function updatePresence(userId: string, isOnline: boolean): void {
  presenceStore.setState((state) =>
    state.users.has(userId)
      ? { users: new Map(state.users).set(userId, { isOnline }) }
      : state,
  );
}

export function clearPresence(): void {
  presenceStore.setState(({ users }) => ({
    users: new Map(Array.from(users.keys(), (id) => [id, {}])),
  }));
}

export async function refreshPresence(signal: AbortSignal): Promise<boolean> {
  const { users: before } = presenceStore.getState();
  const ids = Array.from(before.keys());
  if (!ids.length) return false;

  const requests = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    requests.push(
      friendsService.getPresence(ids.slice(i, i + BATCH_SIZE), signal),
    );
  }
  const results = (await Promise.all(requests)).flat();
  if (signal.aborted) return false;

  const statuses = new Map(results.map(({ id, isOnline }) => [id, isOnline]));
  presenceStore.setState(({ users }) => {
    const next = new Map(users);
    for (const id of ids) {
      // A socket update received during the request takes precedence.
      if (users.has(id) && users.get(id) === before.get(id)) {
        next.set(id, { isOnline: statuses.get(id) ?? false });
      }
    }
    return { users: next };
  });
  return true;
}
