export interface ActiveChatSession {
  repoPath: string;
  confirmResolver: ((confirmed: boolean) => void) | null;
  abortController: AbortController;
}

export class ActiveChatSessions {
  private readonly sessions = new Map<string, ActiveChatSession>();

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  start(sessionId: string, repoPath: string): ActiveChatSession {
    const session: ActiveChatSession = {
      repoPath,
      confirmResolver: null,
      abortController: new AbortController(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): ActiveChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  confirm(sessionId: string, confirmed: boolean): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.confirmResolver) return false;
    session.confirmResolver(confirmed);
    session.confirmResolver = null;
    return true;
  }

  waitForConfirm(sessionId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        resolve(false);
        return;
      }
      session.confirmResolver = resolve;
    });
  }

  cancel(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.abortController.abort();
    if (session.confirmResolver) {
      session.confirmResolver(false);
      session.confirmResolver = null;
    }
    this.sessions.delete(sessionId);
  }

  finish(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
