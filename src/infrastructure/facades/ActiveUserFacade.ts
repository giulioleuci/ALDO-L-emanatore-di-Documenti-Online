/** Running-user identity port (11 §15, `src/onlinetests/checks/pipelineChecks.ts` doc comment). */
export interface IActiveUserFacade {
  getEmail(): string;
}

export class SessionActiveUserFacade implements IActiveUserFacade {
  getEmail(): string {
    return ServiceFactory.getUserService().getActiveUserEmail();
  }
}
