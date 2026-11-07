---
name: "build-mode-usage-optimizer"
description: >-
  Optimizes AI agent context, token usage, and tool efficiency during Google AI Studio Build Mode tasks.
  Applies architectural mapping (Graft/Graphify), persistent project context (Codebase Memory), and role-based execution (Agency Agents)
  to ensure maximum efficiency without sacrificing safety or product integrity.
---

# Build Mode Usage Optimizer & Codebase Intelligence

## 1. Objective
Minimize unnecessary message exchanges, token consumption, redundant file reads, and tool calls during development in Google AI Studio Build Mode. This skill does not increase Google's official quotas; it optimizes how available context and quota are utilized.

## 2. Core Optimization Principles
- **Selective Inspection:** Read only the files strictly necessary for the current task. Never read entire directories or large files recursively unless required.
- **Cache & Reuse:** Reutilize previous diagnostic results, test outcomes, and architectural understandings across tool steps.
- **Incremental Execution:** Break down complex changes into small, isolated, and verifiable steps.
- **Zero Redundant Generation:** Never regenerate code or tests that already pass and work correctly.
- **Compact Documentation:** Maintain concise technical summaries and project context maps to avoid re-querying the codebase structure.
- **Impact Analysis First:** Identify file dependencies and potential side effects before writing code (inspired by Graft & Graphify relational mapping).

## 3. Reference Frameworks & Concepts Applied
- **Graft & Graphify:** Relational awareness of modules, file dependencies, and downstream impacts of changes.
- **Codebase Memory:** Persistent architectural context (`docs/AI_PROJECT_CONTEXT.md`) for quick lookups without repetitive code scans.
- **Agency Agents:** Targeted role-based analysis (Software Architect, Security Auditor, QA Engineer) keeping problem domains strictly bounded.

## 4. Preservation Guardrails
- **NEVER** sacrifice product security, data integrity, authentication rules, TikTok LIVE persistence, or raffle mathematics to save tokens or time.
- **NEVER** deploy or modify production configurations without explicit authorization.
