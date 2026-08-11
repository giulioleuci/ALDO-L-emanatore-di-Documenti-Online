import { materializeLazyRef } from '../../../src/onlinetests/report/MaterializeHelper';

describe('materializeLazyRef', () => {
  it('calls get() and returns the materialized value', () => {
    const get = jest.fn(() => ({ value: 42 }));

    expect(materializeLazyRef({ get })).toEqual({ value: 42 });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns objects without get() unchanged', () => {
    const ref = { value: 42 };

    expect(materializeLazyRef(ref)).toBe(ref);
  });

  it('returns null unchanged', () => {
    expect(materializeLazyRef(null)).toBeNull();
  });
});
