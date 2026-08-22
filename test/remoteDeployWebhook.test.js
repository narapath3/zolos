import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CANONICAL_BODY,
  REQUEST_ID_RE,
  createDeploySignature,
  signatureMatches,
  timestampIsFresh,
} from '../server/api/deploy.js';

const deploySource = fs.readFileSync(new URL('../server/api/deploy.js', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../server/api/index.js', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/remote-deploy.yml', import.meta.url), 'utf8');
const installer = fs.readFileSync(new URL('../deploy/install-remote-deploy-webhook.ps1', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('../deploy/remote-deploy-runner.ps1', import.meta.url), 'utf8');
const batch = fs.readFileSync(new URL('../deploy/ZOLOS-Update-Backend-OneClick.bat', import.meta.url), 'utf8');

const secret = 'test-secret-for-zolos-remote-deploy-32';
const now = Math.floor(Date.now() / 1000).toString();

test('deploy signature covers a fixed action/ref body and rejects tampering', () => {
  assert.equal(CANONICAL_BODY, '{"action":"update","ref":"main"}');
  const signature = createDeploySignature(secret, now);
  assert.match(signature, /^sha256=[a-f0-9]{64}$/);
  assert.equal(signatureMatches(secret, now, signature), true);
  assert.equal(signatureMatches('wrong-secret', now, signature), false);
  assert.equal(signatureMatches(secret, now, `${signature}00`), false);
});

test('deploy timestamp and idempotency values are bounded', () => {
  assert.equal(timestampIsFresh(now, 5 * 60_000), true);
  assert.equal(timestampIsFresh(String(Number(now) - 3600), 5 * 60_000), false);
  assert.equal(REQUEST_ID_RE.test('12345678-1'), true);
  assert.equal(REQUEST_ID_RE.test('short'), false);
  assert.equal(REQUEST_ID_RE.test('x'.repeat(129)), false);
});

test('webhook schedules only a fixed Windows task and stores an atomic receipt', () => {
  assert.match(deploySource, /execFileAsync\('schtasks\.exe', \['\/Run', '\/TN', taskName\]/);
  assert.doesNotMatch(deploySource, /spawn\(/);
  assert.match(deploySource, /fs\.openSync\(filePath, 'wx'/);
  assert.match(deploySource, /body\.action !== 'update' \|\| body\.ref !== 'main' \|\| Object\.keys\(body\)\.length !== 2/);
  assert.match(apiSource, /registerDeployRoutes\(r, wrap\)/);
});

test('GitHub trigger is manual-only, least-privilege, and does not execute repository code on the VPS runner', () => {
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(workflow, /pull_request(_target)?/);
  assert.doesNotMatch(workflow, /actions\/checkout/);
  assert.match(workflow, /ZOLOS_DEPLOY_WEBHOOK_SECRET/);
  assert.match(workflow, /X-Zolos-Deploy-Signature/);
  assert.match(workflow, /X-Zolos-Deploy-Idempotency/);
});

test('one-time installer locks the secret and runner uses non-interactive updater mode', () => {
  assert.match(installer, /ProgramData.*ZOLOS/);
  assert.match(installer, /SetAccessRuleProtection\(\$true, \$false\)/);
  assert.match(installer, /New-ScheduledTaskAction/);
  assert.match(installer, /New-ScheduledTaskTrigger -Once/);
  assert.match(installer, /Register-ScheduledTask/);
  assert.match(installer, /-User 'SYSTEM'/);
  assert.doesNotMatch(installer, /\/SC['\"\s,)]*ONDEMAND/i);
  assert.doesNotMatch(installer, /Invoke-Expression/);
  assert.match(runner, /ZOLOS-Update-Backend-OneClick\.bat/);
  assert.match(runner, /-NoPause/);
  assert.match(batch, /%~1/);
  assert.match(batch, /-NoPause/);
});

test('requestRemoteDeploy queues once and replays safely with the same idempotency key', async () => {
  const { mkdtemp, mkdir, writeFile, chmod, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { requestRemoteDeploy } = await import('../server/api/deploy.js');
  const root = await mkdtemp(join(tmpdir(), 'zolos-deploy-test-'));
  const fakeBin = join(root, 'bin');
  await mkdir(fakeBin);
  const fakeTask = join(fakeBin, 'schtasks.exe');
  await writeFile(fakeTask, '#!/bin/sh\nexit 0\n', 'utf8');
  await chmod(fakeTask, 0o755);
  const original = {
    secret: process.env.ZOLOS_DEPLOY_WEBHOOK_SECRET,
    repo: process.env.ZOLOS_DEPLOY_REPO_PATH,
    task: process.env.ZOLOS_DEPLOY_TASK_NAME,
    path: process.env.PATH,
  };
  process.env.ZOLOS_DEPLOY_WEBHOOK_SECRET = secret;
  process.env.ZOLOS_DEPLOY_REPO_PATH = root;
  process.env.ZOLOS_DEPLOY_TASK_NAME = '\\\\ZOLOS-RemoteDeploy';
  process.env.PATH = `${fakeBin}:${original.path || ''}`;
  try {
    const requestId = 'run-12345678-1';
    const req = {
      get: (name) => ({
        'X-Zolos-Deploy-Timestamp': now,
        'X-Zolos-Deploy-Signature': createDeploySignature(secret, now),
        'X-Zolos-Deploy-Idempotency': requestId,
      }[name]),
      body: { action: 'update', ref: 'main' },
    };
    assert.deepEqual(await requestRemoteDeploy(req), { ok: true, status: 'queued', requestId });
    assert.deepEqual(await requestRemoteDeploy(req), { ok: true, status: 'already_accepted', requestId });
    const files = await (await import('node:fs/promises')).readdir(join(root, 'logs', 'remote-deploy-receipts'));
    assert.equal(files.length, 1);
    const receipt = JSON.parse(await readFile(join(root, 'logs', 'remote-deploy-receipts', files[0]), 'utf8'));
    assert.equal(receipt.requestId, requestId);
  } finally {
    for (const [key, value] of Object.entries({
      ZOLOS_DEPLOY_WEBHOOK_SECRET: original.secret,
      ZOLOS_DEPLOY_REPO_PATH: original.repo,
      ZOLOS_DEPLOY_TASK_NAME: original.task,
      PATH: original.path,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
