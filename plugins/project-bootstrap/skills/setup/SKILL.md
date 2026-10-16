---
name: project-bootstrap-setup
description: Set up the Project Bootstrap plugin for local workspace planning after installation.
---

# Project Bootstrap setup

Confirm that Node.js 20 or later is available before using the local MCP server. Do not install runtimes, change user configuration, or modify a project during onboarding.

Explain that this plugin works only in local Codex tasks because its MCP server runs on the user's machine. Its catalogue and templates are packaged in the plugin; project source is not uploaded by the plugin. If the host supports it, configure `PROJECT_BOOTSTRAP_ALLOWED_ROOT` with the trusted local workspace root before using inventory. If it is absent, the inventory reports that its read boundary was not host-configured; do not claim path restriction.

Tell the user to open the target project locally, enable Codex Plan mode when it is available, then invoke the `project-bootstrap` Skill. The workflow begins with an inventory and a one-decision-at-a-time interview. In a host that offers structured Plan questions, each decision appears as a small set of choices with an `Other`/comment path; other hosts use the equivalent text prompt. When candidates must be compared, the packaged Catalog Explorer UI shows the candidate cards and source Markdown; if the host cannot render it, the Skill uses the text fallback. It then produces a recommendation, validation report, and file/command plan. It changes files only after the user explicitly approves that plan.

If the host does not expose the Project Bootstrap MCP tools after installation, report that integration problem and ask the user to reopen or reinstall the plugin. Do not start the packaged MCP server manually in a terminal or emulate its protocol.

For an upgrade, show the installed plugin version and the available version if the host provides it. Ask the user before invoking the marketplace upgrade workflow.
