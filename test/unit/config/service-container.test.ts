import { ServiceContainer } from '../../../src/config/ServiceContainer';

test('lazy singleton resolution (08 §2)', () => {
  const c = new ServiceContainer();
  let built = 0;
  c.register('x', () => { built += 1; return { v: 42 }; });
  expect(c.has('x')).toBe(true);
  expect(c.get<{ v: number }>('x').v).toBe(42);
  c.get('x');
  expect(built).toBe(1); // instantiated once
});

test('unknown service throws', () => {
  expect(() => new ServiceContainer().get('nope')).toThrow();
});
