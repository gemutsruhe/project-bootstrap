---
name: project-maintenance-setup
description: Set up the Project Maintenance plugin for assessment and approved improvement of an existing local project.
---

# Project Maintenance setup

Confirm that Node.js 20 or later is available before using the local MCP server. Do not install runtimes, change user configuration, or modify a project during onboarding.

Explain that this plugin works only in local Codex tasks because its MCP server runs on the user's machine. Project source is not uploaded by the plugin. If the host supports it, configure `PROJECT_MAINTENANCE_ALLOWED_ROOT` with the trusted local workspace root before using inventory. If it is absent, the inventory reports that its read boundary was not host-configured; do not claim path restriction.

Tell the user to open the existing target project locally, enable Codex Plan mode when it is available, then invoke the `project-maintenance` Skill. The workflow starts with a read-only inventory and assessment. It reports evidence, risks, and prioritized repairs without changing files. When the user chooses a repair, the Skill presents the exact paths, edits, and verification commands; it changes files only after the user explicitly approves that focused plan.

If the host does not expose the Project Maintenance MCP tools after installation, report that integration problem and ask the user to reopen or reinstall the plugin. Do not start the packaged MCP server manually in a terminal or emulate its protocol.

For an upgrade, show the installed plugin version and the available version if the host provides it. Ask the user before invoking the marketplace upgrade workflow.
