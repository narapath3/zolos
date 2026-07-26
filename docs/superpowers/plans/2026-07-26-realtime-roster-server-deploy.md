# Realtime Roster Server Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the deployed Railway revision observable and trigger deployment of the server code that broadcasts every player's city and ping.

**Architecture:** Extract the public health payload into a pure tested helper. Railway's commit SHA is normalized into a bounded revision string and returned by the existing health endpoint; changing `server/` triggers the existing deployment workflow.

**Tech Stack:** Node.js ES modules, Express, Socket.io, Node.js test runner, Railway

## Global Constraints

- Do not expose secrets or arbitrary environment values.
- Do not change gameplay, save data, combat, or roster trust boundaries.
- Keep peer ping authoritative on the map server.

---

### Task 1: Add an observable server revision

**Files:**
- Create: `server/health.js`
- Modify: `server/server.js`
- Create: `test/serverHealth.test.js`

**Interfaces:**
- Produces: `buildHealthPayload({ playerCount, uptime, revision })`
- Consumes: `RAILWAY_GIT_COMMIT_SHA` and `npm_package_version`

- [ ] Write tests for valid commit SHA, invalid revision fallback, bounded values,
  and absence of arbitrary environment fields.
- [ ] Run the focused test and verify that it fails because the module is absent.
- [ ] Implement the pure health payload helper.
- [ ] Use the helper in the existing `/` health route.
- [ ] Run the focused test and verify it passes.

### Task 2: Verify roster and delivery

**Files:**
- Verify: `server/server.js`
- Verify: `server/securityPolicy.js`
- Verify: `.github/workflows/railway-deploy.yml`

- [ ] Confirm `players_global` serializes `mapId` and peer `ping`.
- [ ] Run the full test suite.
- [ ] Run the production frontend build.
- [ ] Commit server, tests, spec, and plan.
- [ ] Push `main` so the `server/**` workflow deploys Railway.
- [ ] Verify the live health revision and two-client roster payload.
