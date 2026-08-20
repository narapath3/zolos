import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ps1 = fs.readFileSync(new URL('../deploy/update-backend-one-click.ps1', import.meta.url), 'utf8');
const bat = fs.readFileSync(new URL('../deploy/ZOLOS-Update-Backend-OneClick.bat', import.meta.url), 'utf8');
const guide = fs.readFileSync(new URL('../deploy/ONE_CLICK_UPDATE.md', import.meta.url), 'utf8');

test('one-click updater is pinned to the expected repository and main branch', () => {
  assert.match(ps1, /narapath3\/zolos/);
  assert.match(ps1, /branch --show-current/);
  assert.match(ps1, /if \(\$branch -ne 'main'\)/);
  assert.match(ps1, /pull', '--ff-only', 'origin', 'main/);
  assert.match(ps1, /Already up to date[\s\S]*Continuing with dependency check and process restart/);
  assert.doesNotMatch(ps1, /Already up to date at \$script:BeforeCommit\. Backend was not restarted/);
});

test('one-click updater protects local work and does not perform routine destructive cleanup', () => {
  assert.match(ps1, /Tracked or staged changes exist/);
  assert.match(ps1, /Keeping \$\(\$untracked\.Count\) untracked path\(s\) untouched/);
  assert.doesNotMatch(ps1, /clean -fd/);
  assert.match(ps1, /reset --hard \$script:BeforeCommit/); // rollback is guarded by the failure path
  assert.match(ps1, /Rolling back code to known-good commit/);
});

test('updater validates code, installs deterministic dependencies, and checks health', () => {
  assert.match(ps1, /--check/);
  assert.match(ps1, /npm\.cmd/);
  assert.match(ps1, /ci', '--omit=dev/);
  assert.match(ps1, /run', 'build/);
  assert.match(ps1, /unknown rpc/);
  assert.match(ps1, /Assert-ProbeHealthy 'Local backend'/);
  assert.match(ps1, /Assert-ProbeHealthy 'Public backend'/);
  assert.match(ps1, /Invoke-NpmCiWithRetry/);
  assert.match(ps1, /--no-audit/);
  assert.match(ps1, /--no-fund/);
  assert.match(ps1, /Windows file-lock error/);
  assert.match(ps1, /Stop-ZolosBackend[\s\S]*Invoke-NpmCiWithRetry/);
  assert.match(ps1, /Restarting the previous backend after a failed same-commit update/);
  assert.match(ps1, /continuing with the existing dependency tree/);
  assert.match(ps1, /return \$false/);
  assert.match(ps1, /Build-FrontendInStaging/);
  assert.match(ps1, /zolos-frontend-stage-/);
  assert.match(ps1, /Staging dependency install remained locked/);
  assert.match(ps1, /Frontend dist replaced from the successful isolated staging build/);
  assert.match(ps1, /Restored the previous frontend dist after update failure/);
});

test('one-click launcher downloads the latest updater and builds the VPS frontend', () => {
  assert.match(bat, /raw\.githubusercontent\.com\/narapath3\/zolos\/main\/deploy\/update-backend-one-click\.ps1\?cachebust=/);
  assert.match(bat, /MARKER=windows-lock-retry-4c65b96/);
  assert.match(bat, /findstr \/C:/);
  assert.match(bat, /-ExecutionPolicy Bypass/);
  assert.match(bat, /-RunFrontendBuild/);
  assert.match(guide, /ZOLOS-Update-Backend-OneClick\.bat/);
  assert.match(guide, /database migration/);
});
