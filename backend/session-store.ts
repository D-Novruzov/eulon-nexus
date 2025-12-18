import type { GitHubUser } from "./github-types.ts";

export interface SessionData {
  id: string;
  githubAccessToken: string;
  githubUser: GitHubUser;
  createdAt: number;
  updatedAt: number;
}

/**
 * Very small in-memory session store used for local development.
 * In production, replace with a durable store (Redis, database, etc.).
 */
class SessionStore {
  private sessions = new Map<string, SessionData>();

  get(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  set(session: SessionData): void {
    this.sessions.set(session.id, session);
  }

  update(
    sessionId: string,
    updates: Partial<Omit<SessionData, "id">>
  ): SessionData | undefined {
    const existing = this.sessions.get(sessionId);
    if (!existing) return undefined;

    const updated: SessionData = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, updated);
    return updated;
  }
}

export const sessionStore = new SessionStore();


