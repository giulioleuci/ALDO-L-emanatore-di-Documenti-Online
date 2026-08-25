type Documento = { tipo: string };
type Cartella = { nome: string };

const specification = new FunctionSpecification<Documento>(
  (candidate) => candidate.tipo === 'VERBALE'
);
specification.isSatisfiedBy({ tipo: 'VERBALE' });

// @ts-expect-error A folder predicate cannot satisfy a document specification.
new FunctionSpecification<Documento>((candidate: Cartella) => candidate.nome.length > 0);

export {};
