/**
 * Running-user identity port (11 §15, `src/onlinetests/checks/pipelineChecks.ts` doc comment).
 * `GoogleApiWrapper`/`ServiceFactory` exposes no wrapped equivalent of `Session.getActiveUser()`
 * (no `UserService`/`getSession*` factory method — see `types/gaslibs/index.d.ts`), so this facade
 * IS the L2 boundary for that one native call, exactly like every other file in this directory.
 */
export interface IActiveUserFacade {
  getEmail(): string;
}

export class SessionActiveUserFacade implements IActiveUserFacade {
  getEmail(): string {
    return Session.getActiveUser().getEmail();
  }
}
