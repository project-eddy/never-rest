/**
 * In-memory users database for the framework examples.
 *
 * Methods return neverthrow `ResultAsync` with `railError` codes that match
 * the contract (`not_found`, `conflict`). Handlers stay on that railway —
 * return the Result, or `andThen` — instead of wrapping `undefined`.
 *
 * Each `createUsersDb()` call is a fresh database (seeded with Ada). A real
 * Postgres or D1 adapter keeps the same `ResultAsync` shape via
 * `ResultAsync.fromPromise`.
 */
import { errAsync, okAsync, type ResultAsync } from 'neverthrow';

import { railError, type RailError } from '@eddy-works/never-rest';

export type UserRecord = {
  id: string;
  name: string;
  passwordHash: string;
};

const ada: UserRecord = {
  id: 'ada',
  name: 'Ada Lovelace',
  // Stored server-side only — must never appear on the wire.
  passwordHash: 'demo-hash-ada',
};

export function createUsersDb() {
  const users = new Map<string, UserRecord>([[ada.id, ada]]);

  return {
    getUser(
      id: string,
    ): ResultAsync<UserRecord, RailError<'not_found'>> {
      const user = users.get(id);
      if (user === undefined) {
        return errAsync(railError('not_found', `User ${id} not found`));
      }
      return okAsync(user);
    },

    listUsers(): ResultAsync<UserRecord[], never> {
      return okAsync([...users.values()]);
    },

    insertUser(
      user: UserRecord,
    ): ResultAsync<UserRecord, RailError<'conflict'>> {
      if (users.has(user.id)) {
        return errAsync(
          railError('conflict', `User ${user.id} already exists`),
        );
      }
      users.set(user.id, user);
      return okAsync(user);
    },

    deleteUser(id: string): ResultAsync<undefined, RailError<'not_found'>> {
      if (!users.has(id)) {
        return errAsync(railError('not_found', `User ${id} not found`));
      }
      users.delete(id);
      return okAsync(undefined);
    },
  };
}

export type UsersDb = ReturnType<typeof createUsersDb>;
