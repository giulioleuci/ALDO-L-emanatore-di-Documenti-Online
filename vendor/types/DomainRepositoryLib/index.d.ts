/**
 * DomainRepositoryLib - Domain-Driven Design patterns for Google Apps Script
 *
 * Brings DDD concepts to Google Apps Script projects:
 * - Entity base class with identity and dirty tracking
 * - Repository pattern for domain-oriented data access
 * - Specification pattern for reusable business rules
 * - Value Objects for immutable domain concepts
 *
 * @module DomainRepositoryLib
 * @version 1.0.0
 */
export { Entity } from './src/Entity.js';
export { ValueObject } from './src/ValueObject.js';
export { Repository } from './src/Repository.js';
export { Specification } from './src/specifications/Specification.js';
export { EqualityFieldSpec } from './src/specifications/EqualityFieldSpec.js';
export { FieldSpecification } from './src/specifications/FieldSpecification.js';
export { FunctionSpecification } from './src/specifications/FunctionSpecification.js';
export { CompositeSpecification } from './src/specifications/CompositeSpecification.js';
export { assertSpecificationContract } from './src/testing/specificationContract.js';
export { EntityMapper } from './src/internal/mapping/EntityMapper.js';
export { HydrationService } from './src/internal/mapping/HydrationService.js';
export { MappingConfiguration } from './src/internal/mapping/MappingConfiguration.js';
export { DynamicFieldMapping } from './src/internal/mapping/DynamicFieldMapping.js';
export { JsonExpansionMapping } from './src/internal/mapping/JsonExpansionMapping.js';
export { QueryTranslator } from './src/internal/query/QueryTranslator.js';
export { SchemaValidator as ZodValidator, ValidationException, z } from '@GasSchemaValidatorLib';
export { DomainException } from './src/internal/errors/DomainException.js';
export { EntityNotFoundException } from './src/internal/errors/EntityNotFoundException.js';
export { InvariantViolationException } from './src/internal/errors/InvariantViolationException.js';
export { SpecificationException } from './src/internal/errors/SpecificationException.js';
export type { DomainRecord, EntityData, EntityId, EntityFactory, DomainLogger, DomainQuery, QuerySpecification, RepositoryDatabase, RepositoryTable, RepositoryCache, RepositoryRetry, RepositoryOptions, DryRunEntity } from './src/internal/contracts.js';
export type { DynamicFieldConfig, ColumnNames } from './src/internal/mapping/DynamicFieldMapping.js';
export type { JsonExpansionConfig } from './src/internal/mapping/JsonExpansionMapping.js';
