import type { IArtifactFactory } from '../../../src/onlinetests/E2eTemplateProvisioner';

/** Minimal artifact seam for builder tests; only ASL source sheets are exercised. */
export function testArtifactFactory(): IArtifactFactory {
  let sequence = 0;
  return {
    createDocument(): string {
      throw new Error('document creation is not used by SharedTestDatabaseBuilder');
    },
    createSheet(): string {
      sequence += 1;
      return `builder_test_artifact_${sequence}`;
    }
  };
}
