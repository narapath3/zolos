function nonNegativeInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function publicRevision(revision, fallbackVersion) {
    const commit = String(revision ?? '').trim().toLowerCase();
    if (/^[0-9a-f]{7,64}$/.test(commit)) return commit.slice(0, 12);

    const version = String(fallbackVersion ?? '').trim();
    return /^\d+\.\d+\.\d+(?:[-+][0-9a-z.-]+)?$/i.test(version)
        ? `v${version.slice(0, 32)}`
        : 'unknown';
}

export function buildHealthPayload({
    playerCount,
    uptime,
    revision,
    fallbackVersion,
} = {}) {
    return {
        status: 'ok',
        server: 'zolos-map-server',
        players: nonNegativeInteger(playerCount),
        uptime: nonNegativeInteger(uptime),
        revision: publicRevision(revision, fallbackVersion),
    };
}
