# SFDV — Salesforce Dependency Viewer

SFDV is a VS Code extension for exploring dependencies between Salesforce metadata in your **local** project—Apex classes, Flows, objects, fields, Lightning components, and more.

> **Heads-up:** This is a **vibe-coded extension** built with AI assistance. It has automated tests, but hasn't been thoroughly tested on real Salesforce projects. References may be missed or incorrect. **Feedback, bug reports, and PRs are welcome!**

## Commands

Open the VS Code Command Palette and search for:

- **SFDV: Show org's dependency graph** — Explore your local metadata graph by component type or file.
- **SFDV: Show Metadata referenced in current file** — See what the current file uses.
- **SFDV: Show Metadata referencing current file** — See what uses the current file.

## Getting Started

1. Install the `SFDV.vsix` using **Extensions → ⋯ → Install from VSIX...**.
2. Open your Salesforce DX project and run an `SFDV` command.

By default, only `force-app` is scanned. Change this in VS Code settings if needed:

```json
{
  "sfdv.sourceFolder": "force-app"
}
```

No Salesforce org connection is required. Unresolved references appear as grey dotted connections. **Always verify dependencies before deleting or changing metadata.**

**License:** MIT