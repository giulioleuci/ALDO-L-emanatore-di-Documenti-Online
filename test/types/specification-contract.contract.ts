export {};

type AssertFalse<T extends false> = T;
type ContractParameter = Parameters<typeof assertSpecificationContract>[0];

/** Compile-time guard: a generic queryable spec without toQueryObject is not accepted. */
export type SpecificationContractRequiresQueryMethod = AssertFalse<
  QueryableSpecification extends ContractParameter ? true : false
>;
