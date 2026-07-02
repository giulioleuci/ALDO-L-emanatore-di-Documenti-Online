// ALDO entry point. GAS calls top-level global functions by name.
// gas-webpack-plugin hoists `global.<name> = ...` assignments to true globals.
export function aldoPing(): string {
  return 'ALDO OK';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
(globalThis as any).aldoPing = aldoPing;
