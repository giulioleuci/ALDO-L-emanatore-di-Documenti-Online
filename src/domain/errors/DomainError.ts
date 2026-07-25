export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class ValidationError extends DomainError {}
export class EntityNotFoundError extends DomainError {}
export class MateriaNotFoundError extends DomainError {}
export class AmbiguousVariazioneCattedraError extends DomainError {}
export class VariazioneCattedraInconsistenteError extends DomainError {}
export class VariazioneCattedraTitolareNonTrovatoError extends DomainError {}
export class PipelineError extends DomainError {}
export class ConfigurationError extends DomainError {}
