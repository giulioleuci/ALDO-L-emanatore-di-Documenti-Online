import { AldoEntity } from '../../../src/domain/entities/AldoEntity';

/** Minimal concrete subclass — AldoEntity itself is abstract. */
class TestEntity extends AldoEntity {
  constructor(data: Record<string, unknown> = {}) {
    super(data);
  }
  override toData(): EntityData {
    return { id: this.id };
  }
}

test('validate() always returns true, bypassing the library MappingConfiguration check', () => {
  const e = new TestEntity();
  expect(e.validate()).toBe(true);
});

test('constructs with an id from the data bag and exposes it via the inherited getter', () => {
  const e = new TestEntity({ id: 'abc-123' });
  expect(e.id).toBe('abc-123');
});

test('id defaults to null when absent from the data bag', () => {
  const e = new TestEntity({});
  expect(e.id).toBeNull();
});

test('markDirty/isDirty/getDirtyFields track field-level dirtiness (inherited from Entity)', () => {
  const e = new TestEntity({ id: 'x' });
  expect(e.isDirty('FOO')).toBe(false);
  e.markDirty('FOO');
  expect(e.isDirty('FOO')).toBe(true);
  expect(e.getDirtyFields()).toEqual(['FOO']);
});

test('toData() must be implemented by the subclass (AldoEntity does not supply a default)', () => {
  const e = new TestEntity({ id: 'x' });
  expect(e.toData()).toEqual({ id: 'x' });
});
