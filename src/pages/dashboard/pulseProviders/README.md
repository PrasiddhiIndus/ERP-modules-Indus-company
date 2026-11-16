# Company Pulse providers

The main dashboard (`/app/dashboard`) auto-discovers modules from `NAV_MODULE_TREE`.

## Add metrics for a module (no CompanyPulse edit)

1. Ensure the module exists in `src/config/roles.js` → `NAV_MODULE_TREE`.
2. Add `src/pages/<your-module>/pulseProvider.js`:

```js
export default {
  id: "operations", // must match NAV_MODULE_TREE.value
  meta: { short: "Ops", revenue: false, order: 55 },
  linkKeys: ["operations.fleet"],
  realtimeTables: [{ schema: "public", table: "your_table" }],
  async load() {
    return { opsOpenJobs: 12 };
  },
  signals({ modules }) {
    return {
      metrics: [{ label: "Open jobs", value: String(modules.opsOpenJobs || 0) }],
      score: 90,
      attention: (modules.opsOpenJobs || 0) > 20,
    };
  },
};
```

3. Refresh the app. The module cell picks up metrics automatically.

Built-ins live in `builtIn.js`. A file provider with the same `id` overrides the built-in.
