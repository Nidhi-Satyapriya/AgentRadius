---
name: modular-engineering
description: Enforce modular architecture, clean code, DRY logic, SOLID principles, separation of concerns, and maintainable engineering across the entire repository. Use whenever creating, modifying, refactoring, reviewing, or testing code.
---

# Modular Engineering Skill

## Objective

Build software that is modular, cohesive, loosely coupled, testable, readable, and easy to extend. Optimize for long-term maintainability rather than the fewest lines of code or the fastest initial implementation.

Apply these rules to every implementation task, not just explicit refactoring requests.

## 1. Architecture and Repository Structure

- Organize code by domain, responsibility, and feature rather than creating large, generic utility directories.
- Separate business logic, application orchestration, infrastructure, API boundaries, and presentation.
- Keep domain logic independent of frameworks, databases, network clients, and UI components wherever practical.
- Define explicit boundaries between modules. Modules must communicate through stable interfaces and typed contracts.
- Keep dependency direction consistent: outer layers may depend on inner layers, but core domain logic must not depend on infrastructure or presentation.
- Avoid circular dependencies and hidden cross-module coupling.
- Give every module a clear, narrow responsibility and a documented public interface.
- Create new modules when they establish a meaningful boundary, not merely to split files arbitrarily.

## 2. Clean Code and SOLID

- Apply Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion where appropriate.
- Prefer descriptive names that communicate intent and domain meaning.
- Keep functions small and focused on one coherent operation.
- Use early returns and guard clauses to reduce unnecessary nesting.
- Replace unexplained literals with named constants or configuration.
- Avoid deeply nested conditionals, giant classes, giant functions, and files with unrelated responsibilities.
- Prefer composition over inheritance when it simplifies the design.
- Do not introduce abstractions, interfaces, factories, or design patterns without a concrete use case.
- Keep comments focused on why a decision exists, not what obvious code does.
- Remove dead code, unused imports, unreachable branches, and obsolete compatibility paths when safe.

## 3. DRY Without Over-Abstraction

- Maintain a single authoritative implementation for each business rule.
- Extract duplicated logic when it represents the same concept or behavior.
- Reuse shared validation, normalization, authorization, error handling, and serialization logic where appropriate.
- Do not duplicate algorithms across API endpoints, UI components, connectors, or analysis modules.
- Do not force superficially similar logic into one abstraction when the underlying business rules differ.
- Prefer a small amount of obvious duplication over a premature, overly generic framework.
- Establish clear ownership for shared functions and avoid circular imports from shared modules.

## 4. Function, Class, and File Design

- Each function should have a clear purpose, explicit inputs, and predictable outputs.
- Keep side effects visible and localized.
- Separate pure calculations from I/O and orchestration.
- Pass dependencies explicitly instead of relying on hidden global state.
- Use immutable data where practical, especially for analysis results and domain objects.
- Keep files small enough to understand without navigating unrelated functionality.
- Split a file when its responsibilities, dependencies, or public interface become difficult to reason about—not based on an arbitrary line limit.
- Avoid both monolith files and excessive one-function-per-file fragmentation.
- Make errors explicit. Never silently swallow exceptions or return success-shaped defaults after failures.

## 5. Types, Contracts, and Validation

- Use strict typing and domain-specific types wherever supported by the language.
- Validate untrusted input at system boundaries.
- Distinguish external input schemas, internal domain models, and API response models when their requirements differ.
- Establish one canonical representation for each core domain concept.
- Keep serialization, parsing, and schema migration logic at explicit boundaries.
- Make invalid states difficult to represent.
- Document units, identifiers, nullability, defaults, and error behavior.
- Treat schema changes as contract changes: update consumers, fixtures, tests, and documentation together.

## 6. Testing and Reliability

- Write unit tests for deterministic business logic and integration tests for module boundaries.
- Test observable behavior, edge cases, failure modes, and invariants rather than private implementation details.
- Mock external systems at boundaries, not internal functions unnecessarily.
- Make tests independent, deterministic, and easy to diagnose.
- Add regression tests for discovered bugs.
- Keep test names descriptive and aligned with business behavior.
- Avoid tests that merely duplicate implementation details or pass without meaningful assertions.
- Run relevant tests, type checks, linting, and formatting after changes; report anything that could not be run.

## 7. Security and Data Handling

- Apply least privilege and secure defaults.
- Never log, commit, or persist secrets unnecessarily.
- Validate and sanitize external input, while preserving legitimate domain semantics.
- Keep authorization decisions centralized in the appropriate domain or policy layer.
- Make security-relevant side effects explicit and auditable.
- Treat connector output, tool descriptions, imported configuration, and external content as untrusted data.
- Prefer read-only behavior unless a write operation is explicitly required and authorized.

## 8. AgentRadius-Specific Engineering Rules

- Keep graph construction, graph storage, traversal, permission evaluation, blast-radius calculation, impact simulation, and finding generation in distinct, well-defined modules.
- Use a canonical graph/domain model rather than maintaining conflicting representations in different features.
- Separate observed facts from inferred relationships and computed risk conclusions.
- Preserve provenance for graph edges, permissions, findings, and inferred paths.
- Make analysis algorithms deterministic for identical inputs and configuration.
- Keep connector-specific parsing inside connector adapters. Normalize connector output into canonical domain models before analysis.
- Keep frontend components focused on presentation and interaction. Move complex business rules into reusable, independently tested modules.
- Ensure the UI and API consume the same documented domain contracts.
- Avoid embedding permission-analysis rules in route handlers, React components, or connector implementations.
- Never expose secret values in graph nodes, logs, findings, fixtures, or API responses.

## 9. Implementation Workflow

Before coding:
1. Inspect the existing repository structure and relevant modules.
2. Identify the owning domain, existing abstractions, contracts, and tests.
3. Propose the smallest coherent change that satisfies the requirement.
4. Identify affected dependencies and backward-compatibility risks.

While coding:
1. Reuse existing abstractions when they are appropriate.
2. Implement one cohesive responsibility at a time.
3. Keep interfaces explicit and dependencies directed.
4. Add or update tests alongside implementation.
5. Avoid unrelated refactoring and unnecessary dependencies.

After coding:
1. Review the diff for duplication, coupling, unnecessary abstractions, and accidental scope expansion.
2. Check types, error handling, security boundaries, and edge cases.
3. Run relevant tests, linting, formatting, and type checks.
4. Update documentation and examples when contracts or behavior change.
5. Summarize what changed, important design decisions, validation performed, and known limitations.

## 10. Required Engineering Review

Before considering a task complete, verify:

- [ ] Each module has a clear responsibility and owner.
- [ ] Dependencies follow the intended architecture.
- [ ] Business logic is not unnecessarily duplicated.
- [ ] Functions and classes are focused and appropriately sized.
- [ ] Types and interfaces are explicit.
- [ ] Error handling is intentional and observable.
- [ ] Tests cover behavior and relevant edge cases.
- [ ] No unnecessary dependencies or speculative abstractions were added.
- [ ] Security-sensitive data and side effects are handled safely.
- [ ] Documentation and contracts remain consistent.

If an existing codebase violates these rules, improve the relevant area incrementally. Do not rewrite unrelated modules merely to achieve theoretical architectural purity.

**Final principle:** Choose the simplest design that preserves clear boundaries, correct behavior, testability, and future extensibility. Prefer understandable code over clever code and deliberate abstractions over accidental complexity.