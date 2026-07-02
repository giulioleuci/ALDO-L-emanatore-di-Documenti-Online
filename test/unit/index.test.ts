import { aldoPing } from '../../src/index';

test('aldoPing returns readiness string', () => {
  expect(aldoPing()).toBe('ALDO OK');
});
