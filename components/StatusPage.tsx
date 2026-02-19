import React, { useEffect, useMemo, useState } from 'react';

type ServiceStatus = {
  ok: boolean;
  status: number;
  latencyMs: number;
  url: string;
  error?: string;
};

type StatusPayload = {
  ok: boolean;
  checkedAt: string;
  services: Record<string, ServiceStatus>;
  netlifyBadge: {
    imageUrl: string;
    deploysUrl: string;
  };
};

const POLL_INTERVAL_MS = 20000;

const resolveLabel = (status: ServiceStatus) => {
  if (status.ok) return 'OK';
  if (status.status >= 500 || status.status === 0) return 'DOWN';
  return 'DEGRADED';
};

export const StatusPage: React.FC = () => {
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState('');
  const [lastRefreshAt, setLastRefreshAt] = useState('');

  const loadStatus = async () => {
    try {
      const response = await fetch('/.netlify/functions/status_check', { method: 'GET' });
      const body = await response.json();
      setPayload(body);
      setLastRefreshAt(new Date().toISOString());
      setRefreshError('');
    } catch {
      setRefreshError('Unable to refresh status right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const headline = useMemo(() => {
    if (!payload) return 'Checking systems...';
    const entries = Object.values(payload.services || {});
    const hasDown = entries.some((item) => !item.ok && (item.status >= 500 || item.status === 0));
    if (hasDown) return 'Partial outage';
    const allOk = entries.every((item) => item.ok);
    if (allOk) return 'All systems operational';
    return 'Degraded performance';
  }, [payload]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-200">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white">P3 System Status</h1>
            <p className="text-sm text-zinc-500 mt-1">{headline}</p>
          </div>
          <a
            href="https://app.netlify.com/projects/p3-lending-protocol/deploys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
          >
            <img
              src="https://api.netlify.com/api/v1/badges/ebfbace1-b5fa-40d8-baa9-f631ff3dcf89/deploy-status"
              alt="Netlify deploy status"
              className="h-6 w-auto"
            />
          </a>
        </div>

        <div className="text-xs text-zinc-500">
          Last checked: {payload?.checkedAt ? new Date(payload.checkedAt).toLocaleString() : '—'}
          {lastRefreshAt ? ` · Last refresh attempt: ${new Date(lastRefreshAt).toLocaleTimeString()}` : ''}
        </div>
        {refreshError && <div className="text-xs text-amber-400">{refreshError}</div>}

        {loading && !payload ? (
          <div className="text-sm text-zinc-400">Loading status...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(payload?.services || {}).map(([name, status]) => {
              const label = resolveLabel(status);
              const badgeClass =
                label === 'OK'
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : label === 'DOWN'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-amber-500/20 text-amber-400';
              return (
                <div key={name} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-white capitalize">{name}</div>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${badgeClass}`}>{label}</span>
                  </div>
                  <div className="text-xs text-zinc-400 break-all">{status.url}</div>
                  <div className="text-xs text-zinc-500">HTTP: {status.status || 'n/a'} · Latency: {status.latencyMs}ms</div>
                  {status.error && <div className="text-xs text-amber-400">Reason: {status.error}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
