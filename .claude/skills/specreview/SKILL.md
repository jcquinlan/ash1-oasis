---
model: 'opus'
disable-model-invocation: true
---

# /specreview - Spec Review Agent

Reviews PROJECT.md and provides architectural and data modeling feedback before you feed it into `/harness`.

## Usage

```
/specreview
```

## Instructions

Read `PROJECT.md` in the working directory. Then provide a structured review covering the sections below. Be direct and opinionated — the goal is to surface gaps, contradictions, and missing decisions before PRDs get written.

### 1. Completeness Check

For each section in PROJECT.md, flag whether it's:
- **Filled** — has enough detail for a planner to act on
- **Thin** — present but too vague to produce good PRDs
- **Empty** — missing entirely

Call out the sections that matter most for this particular project.

### 2. Architecture Review

Based on the tech stack and requirements:
- Does the proposed structure make sense for this stack?
- Are there obvious patterns this project should follow that aren't mentioned? (e.g., if it's a React app with SQLite, how does data flow? ORM choice? State management?)
- Are there architectural decisions hiding in the requirements that should be made explicit?
- Flag any tension between stated requirements and stated architecture

### 3. Data Model Review

Based on the requirements:
- Propose or critique the data model — what are the core entities?
- Identify relationships (one-to-many, many-to-many, ownership)
- Call out entities that are implied by requirements but not listed
- Flag fields that will likely be needed for the requirements to work
- Note any indexing or query patterns the requirements imply

### 4. Open Questions

Surface questions the user hasn't asked but should answer before building:
- Ambiguities in requirements that would force the planner to guess
- Decisions that will be expensive to change later (auth strategy, data model shape, API contract)
- Missing non-functional requirements (auth, error handling, pagination, rate limiting)

### 5. Update PROJECT.md

After completing your review (steps 1-4), **directly edit PROJECT.md** to fill in every empty or thin section with your expert recommendations. This is mandatory — do not just suggest edits, apply them.

Rules for updating:
- **Empty sections**: Fill with your best expert opinion based on the tech stack and requirements. If a section is genuinely not applicable (e.g., API Design for a client-only app, Data Model for a stateless tool), replace the placeholder with a brief note explaining why it's omitted (e.g., "Not applicable — this is a client-side SPA with no backend.").
- **Thin sections**: Expand with concrete detail sufficient for the planner to act on. Preserve the user's original intent — add specificity, don't change direction.
- **Filled sections**: Leave unchanged unless they contain a contradiction you flagged above, in which case add a `> **Note:**` callout inline rather than overwriting.
- **User's own words**: Never delete or rewrite content the user wrote. Add to it, annotate it, or fill around it.
- **Template boilerplate**: Remove instructional placeholder text (e.g., "What the system should do. Write these as concrete behaviors, not vague goals." or "Any patterns you want followed..."). Replace with actual content.
- **Open Questions the user wrote**: Leave those intact. Add your own additional questions below them.

After editing, output a short changelog summarizing what you added or changed and why.
