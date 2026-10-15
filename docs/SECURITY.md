# Security model

The local MCP server performs deterministic catalogue parsing, read-only workspace inspection, recommendation, validation, and plan generation. It exposes no tool that writes project files, executes shell commands, changes Git state, or contacts a central project service.

The Codex Skill is responsible for all changes after a user approves a displayed plan. It must preserve existing files, stop on a content conflict, and request separate command approval. The optional update check is the only intended network workflow; it is delegated to the Codex marketplace host rather than the MCP server.

When `PROJECT_BOOTSTRAP_ALLOWED_ROOT` is set, workspace inspection rejects paths outside that directory. The bundled MCP configuration declares this variable for host pass-through; deployments should set it to the trusted local workspace root where host support is available. When a host does not provide it, inventory returns an explicit `host-boundary-not-configured` status rather than claiming the inspection is restricted.

The plugin never creates or rewrites `.codex/config.toml`. Native Codex configuration, branch protection, rulesets, required reviews, and hosted identity settings remain outside the plugin's generated files.
