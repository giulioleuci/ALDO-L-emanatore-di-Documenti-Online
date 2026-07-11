import { ServiceContainer } from '../../../src/config/ServiceContainer';
import { DomainError } from '../../../src/domain/errors/DomainError';

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

// REPORT_GLF.md B8: ServiceContainer now delegates storage/lazy-resolution to
// CoreUtilsLib.LazyServiceContainer, but must keep its own DomainError
// contract for an unregistered lookup, and pass itself (not the library's
// inner container) to registered factories.
test('unknown service throws a typed DomainError with the Italian message', () => {
  try {
    new ServiceContainer().get('nope');
    throw new Error('expected get() to throw');
  } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as Error).message).toBe('Servizio non registrato: nope');
  }
});

test('a factory resolving a sibling service receives the ServiceContainer, not the inner library container', () => {
  const c = new ServiceContainer();
  c.register('a', () => 'A-VALUE');
  c.register('b', (container) => {
    expect(container).toBeInstanceOf(ServiceContainer);
    return `B depends on ${container.get<string>('a')}`;
  });

  expect(c.get<string>('b')).toBe('B depends on A-VALUE');
});
