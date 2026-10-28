describe('vendored GasLibraryFactory public API', () => {
  it('publishes the TypeScript monitoring library and its sidebar builder', () => {
    const sidebar = {
      setTitle: jest.fn().mockReturnThis(),
      setContent: jest.fn().mockReturnThis(),
      setWidth: jest.fn().mockReturnThis(),
      show: jest.fn()
    };
    const ui = { createSidebar: () => sidebar };
    const dashboard = new DashboardUi(ui, new LoggerService());

    dashboard.createSidebar('job-1', 'ALDO monitoraggio');

    expect(typeof ProcessMonitorService).toBe('function');
    expect(sidebar.setTitle).toHaveBeenCalledWith('ALDO monitoraggio');
    expect(sidebar.setContent).toHaveBeenCalledWith(expect.stringContaining('job-1'));
  });

  it('publishes the effective-assignment and collection-projection APIs', () => {
    const logger = new LoggerService();
    const slot = new AssignmentSlot({ dimensions: { channel: 'EMAIL', subject: 'S1' } });
    const candidate = new AssignmentCandidate({ id: 'base', actorId: 'teacher', slot });
    const override = new AssignmentOverride({
      id: 'override',
      previousActorId: 'teacher',
      nextActorId: 'substitute',
      slotScope: { subject: 'S1' },
      effectiveFrom: new Date('2026-01-10')
    });
    const policy = new ResolutionPolicy();
    const trace = new ResolutionTrace();
    const registry = new ProjectionRegistry();
    const projector = new CollectionProjector({ logger, registry });
    const interceptor = new CollectionProjectionInterceptor(logger, projector, {
      targetProviders: ['assignments'],
      targetPaths: ['items'],
      operations: [{ type: 'distinctBy', keys: ['id'] }]
    });

    expect(slot.matches({ subject: 'S1' })).toBe(true);
    expect(candidate.isValidAt(new Date('2026-01-10'))).toBe(true);
    expect(override.matches(candidate, new Date('2026-01-10'))).toBe(true);
    expect(policy.toJSON().routingPolicy).toBe(RoutingPolicy.DELEGATE_OR_PRINCIPAL);
    expect(trace.toJSON()).toEqual([]);
    expect(
      projector.project([{ id: 1 }, { id: 1 }], [{ type: 'distinctBy', keys: ['id'] }]).value
    ).toEqual([{ id: 1 }]);
    expect(interceptor).toBeInstanceOf(ContextInterceptor);

    const assignmentSource = new WideRowAssignmentSource();
    expect(assignmentSource).toBeInstanceOf(EffectiveAssignmentSource);
    expect(assignmentSource).not.toBeInstanceOf(AssignmentSource);
    expect(typeof EffectiveAssignmentSource.prototype.getAssignments).toBe('function');
    expect(typeof AssignmentSource.prototype.getAssignmentsForRole).toBe('function');

    const result = new EffectiveAssignmentResult({
      slot,
      delegationChain: DelegationChain.empty(),
      metadata: { candidateId: candidate.id }
    });
    expect(result.delegationChain).toBeInstanceOf(DelegationChain);
    expect(result.metadata).toEqual({ candidateId: candidate.id });
    expect(new MalformedAssignmentSlotError('invalid slot')).toBeInstanceOf(RoleResolutionError);

    // eslint-disable-next-line no-constant-condition
    if (false) {
      // @ts-expect-error The runtime requires a real DelegationChain instance.
      new EffectiveAssignmentResult({
        slot,
        delegationChain: { isEmpty: () => true, toJSON: () => [] }
      });
    }

    const exportedConstructors: unknown[] = [
      EffectiveAssignmentResult,
      EffectiveAssignmentSource,
      OverrideSource,
      ActorSource,
      WideRowAssignmentSource,
      MappedOverrideSource,
      MappedDelegationSource,
      CompositeAssignmentSource,
      EffectiveAssignmentResolver,
      MalformedAssignmentSlotError,
      DuplicateAssignmentSlotError,
      InconsistentAssignmentOverrideError,
      AmbiguousAssignmentOverrideError,
      AssignmentActorNotFoundError,
      OverlappingDelegationError,
      CollectionProjectionError
    ];
    exportedConstructors.forEach((exported) => expect(typeof exported).toBe('function'));
  });

  it('does not publish removed compatibility globals', () => {
    const globals = globalThis as Record<string, unknown>;

    expect(globals['PriorityChainResolver']).toBeUndefined();
    expect(globals['SwapAndEnrichInterceptor']).toBeUndefined();
  });

  it('publishes hierarchical logging methods', () => {
    const logger = new LoggerService();

    expect(typeof logger.logJobStart).toBe('function');
    expect(typeof logger.logJobResume).toBe('function');
    expect(typeof logger.logPipelineStep).toBe('function');
    expect(typeof logger.logSummary).toBe('function');
  });
});
