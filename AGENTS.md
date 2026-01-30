# Agent Instructions

## Svelte & SvelteKit (svelte-code-writer)
- **Runes First:** Default to Svelte 5 Runes ($state, $derived, $props) for all new components.
- **Skill Alignment:** Follow the architectural patterns defined in the `svelte-code-writer` skill for component lifecycle and state management.

## Observability (logging-best-practices)
- **Structured Logging:** Apply the `logging-best-practices` skill to all SvelteKit server-side code (`+page.server.ts`, `+server.ts`) and complex client-side logic.
- **Contextual Logs:** Ensure logs include relevant metadata (e.g., Request IDs in hooks, component names in client errors) as per the skill's guidelines.
- **Avoid Silent Catch:** Never use empty catch blocks; always use the logging patterns defined in your skills to capture errors.

## Execution Priority
1. Use `svelte-code-writer` to determine **how** to build the feature.
2. Use `logging-best-practices` to determine **how to monitor** that feature.
