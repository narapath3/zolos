import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { httpErr } from './auth.js';

const CANONICAL_BODY = JSON.stringify({ action: 'update', ref: 'main' });
const DEFAULT_REPO_PATH = 'C:\\Users\\Administrator\\Desktop\\zolos';
const DEFAULT_TASK_NAME = '\\ZOLOS-RemoteDeploy';
const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const TIMESTAMP_RE = /^\d{10,13}$/;

function config() {
    return {
        secret: String(process.env.ZOLOS_DEPLOY_WEBHOOK_SECRET || ''),
        repoPath: path.resolve(process.env.ZOLOS_DEPLOY_REPO_PATH || DEFAULT_REPO_PATH),
        taskName: String(process.env.ZOLOS_DEPLOY_TASK_NAME || DEFAULT_TASK_NAME),
        maxSkewMs: Math.max(30_000, Math.min(15 * 60_000, Number(process.env.ZOLOS_DEPLOY_MAX_SKEW_MS) || 5 * 60_000)),
    };
}

function receiptPath(repoPath, requestId) {
    const digest = crypto.createHash('sha256').update(requestId).digest('hex');
    return path.join(repoPath, 'logs', 'remote-deploy-receipts', `${digest}.json`);
}

function readReceipt(filePath) {
    try {
        const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return value && value.requestId ? value : null;
    } catch {
        return null;
    }
}

function claimReceipt(filePath, receipt) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    let fd;
    try {
        fd = fs.openSync(filePath, 'wx', 0o600);
        fs.writeFileSync(fd, JSON.stringify(receipt), { encoding: 'utf8' });
        fs.closeSync(fd);
        return true;
    } catch (error) {
        if (fd !== undefined) {
            try { fs.closeSync(fd); } catch { /* best effort */ }
        }
        if (error?.code === 'EEXIST') return false;
        throw error;
    }
}

export function createDeploySignature(secret, timestamp) {
    return `sha256=${crypto.createHmac('sha256', secret)
        .update(`${timestamp}.${CANONICAL_BODY}`, 'utf8')
        .digest('hex')}`;
}

export function signatureMatches(secret, timestamp, signature) {
    if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = Buffer.from(createDeploySignature(secret, timestamp).slice('sha256='.length), 'hex');
    const supplied = Buffer.from(signature.slice('sha256='.length), 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function timestampIsFresh(timestamp, maxSkewMs) {
    const numeric = Number(timestamp);
    const millis = timestamp.length === 10 ? numeric * 1000 : numeric;
    return Number.isSafeInteger(numeric) && Math.abs(Date.now() - millis) <= maxSkewMs;
}

const execFileAsync = promisify(execFile);

async function scheduleRemoteUpdate(taskName) {
    try {
        const result = await execFileAsync('schtasks.exe', ['/Run', '/TN', taskName], {
            windowsHide: true,
            timeout: 15_000,
        });
        return result && result.stderr === '';
    } catch {
        return false;
    }
}

export async function requestRemoteDeploy(req) {
    const { secret, repoPath, taskName, maxSkewMs } = config();
    if (secret.length < 32 || !fs.existsSync(repoPath)) {
        throw httpErr(503, 'deploy endpoint unavailable');
    }

    const timestamp = String(req.get('X-Zolos-Deploy-Timestamp') || '');
    const signature = String(req.get('X-Zolos-Deploy-Signature') || '');
    const requestId = String(req.get('X-Zolos-Deploy-Idempotency') || '');
    if (!TIMESTAMP_RE.test(timestamp) || !timestampIsFresh(timestamp, maxSkewMs)) {
        throw httpErr(401, 'invalid deploy authentication');
    }
    if (!REQUEST_ID_RE.test(requestId) || !signatureMatches(secret, timestamp, signature)) {
        throw httpErr(401, 'invalid deploy authentication');
    }

    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (body.action !== 'update' || body.ref !== 'main' || Object.keys(body).length !== 2) {
        throw httpErr(400, 'invalid deploy request');
    }

    const filePath = receiptPath(repoPath, requestId);
    const receipt = {
        requestId,
        status: 'queued',
        ref: 'main',
        acceptedAt: new Date().toISOString(),
    };
    try {
        if (!claimReceipt(filePath, receipt)) {
            return { ok: true, status: 'already_accepted', requestId };
        }
    } catch {
        throw httpErr(503, 'deploy service unavailable');
    }

    if (!(await scheduleRemoteUpdate(taskName))) {
        try { fs.unlinkSync(filePath); } catch { /* best effort */ }
        throw httpErr(503, 'deploy service unavailable');
    }
    return { ok: true, status: 'queued', requestId };
}

export function registerDeployRoutes(router, wrap) {
    router.post('/admin/deploy', wrap(async (req, res) => {
        const result = await requestRemoteDeploy(req);
        res.status(result.status === 'queued' ? 202 : 200).json(result);
    }));
}

export { CANONICAL_BODY, REQUEST_ID_RE };
