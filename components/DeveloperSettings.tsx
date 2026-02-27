import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import type { ApiKeyRow, UsageRow, AuditRow, OrgPlanStatus } from '../services/developerApiService';
import { listKeys, createKey, revokeKey, getUsage, getAudit, getPlan } from '../services/developerApiService';

type DevTab = 'keys' | 'usage' | 'audit' | 'plan';

export const DeveloperSettings: React.FC = () => {
  const [tab, setTab] = useState<DevTab>('keys');
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [plan, setPlan] = useState<OrgPlanStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState('');
  const [createName, setCreateName] = useState('');
  const [createEnv, setCreateEnv] = useState<'live' | 'test'>('live');
  const [creating, setCreating] = useState(false);
  const [newKeyShown, setNewKeyShown] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listKeys();
      setKeys(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const loadUsage = async () => {
    setLoadingUsage(true);
    setError('');
    try {
      const data = await getUsage();
      setUsage(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage');
    } finally {
      setLoadingUsage(false);
    }
  };

  const loadAudit = async () => {
    setLoadingAudit(true);
    setError('');
    try {
      const data = await getAudit();
      setAudit(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    if (tab === 'usage') loadUsage();
  }, [tab]);
  useEffect(() => {
    if (tab === 'audit') loadAudit();
  }, [tab]);

  const loadPlan = async () => {
    setLoadingPlan(true);
    setError('');
    try {
      const data = await getPlan();
      setPlan(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load plan');
    } finally {
      setLoadingPlan(false);
    }
  };
  useEffect(() => {
    if (tab === 'plan') loadPlan();
  }, [tab]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const { raw_key } = await createKey({
        name: createName.trim(),
        env: createEnv,
        scopes: ['score:read', 'score:history'],
      });
      setNewKeyShown(raw_key);
      setCreateName('');
      await loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? It will stop working immediately.')) return;
    setRevokingId(id);
    setError('');
    try {
      await revokeKey(id);
      if (newKeyShown) setNewKeyShown(null);
      await loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke key');
    } finally {
      setRevokingId(null);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
  };

  const tabClass = (t: DevTab) =>
    `px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
    }`;

  const isSandbox = plan?.plan === 'sandbox';
  const liveBlocked = isSandbox && createEnv === 'live';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Developer Console</h2>
        <p className="text-sm text-zinc-500">
          API keys, usage, and audit logs. Use keys with <code className="text-zinc-400">Authorization: Bearer &lt;key&gt;</code>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
        <button type="button" onClick={() => setTab('keys')} className={tabClass('keys')}>API Keys</button>
        <button type="button" onClick={() => setTab('plan')} className={tabClass('plan')}>Plan &amp; Billing</button>
        <button type="button" onClick={() => setTab('usage')} className={tabClass('usage')}>Usage</button>
        <button type="button" onClick={() => setTab('audit')} className={tabClass('audit')}>Audit Logs</button>
        <a href="https://developers.p3lending.space" target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-sm text-zinc-500 hover:text-[#00e599] transition-colors">Docs →</a>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-500/50 text-red-300 text-sm">
          {error}
        </div>
      )}

      {tab !== 'keys' && (
        <>
          {tab === 'plan' && (
            <div className="glass-panel rounded-xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">Plan</h3>
                  <p className="text-xs text-zinc-500">
                    Sandbox keys are for testing. Live keys require a paid plan.
                  </p>
                </div>
                <a
                  href="mailto:founders@p3lending.space?subject=Upgrade%20P3%20Developer%20API%20Plan"
                  className="text-xs px-3 py-2 rounded-lg bg-[#00e599] text-black font-semibold hover:opacity-90"
                >
                  Upgrade to Paid
                </a>
              </div>

              {loadingPlan ? (
                <p className="text-zinc-500 text-sm mt-4">Loading...</p>
              ) : !plan ? (
                <p className="text-zinc-500 text-sm mt-4">Plan data unavailable.</p>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">Current plan</div>
                    <div className="text-sm text-white font-semibold capitalize">{plan.plan}</div>
                    <div className="text-[10px] text-zinc-500 mt-1">Status: {plan.status}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">Monthly quota</div>
                    <div className="text-sm text-white font-semibold">{plan.monthly_limit.toLocaleString()} requests</div>
                    <div className="text-[10px] text-zinc-500 mt-1">
                      Resets {new Date(plan.current_period_end).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                    <div className="text-[10px] text-zinc-500">This period</div>
                    <div className="text-sm text-white font-semibold">
                      {plan.usage_month.requests.toLocaleString()} used
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-1">
                      {plan.usage_month.remaining.toLocaleString()} remaining · {plan.usage_month.errors.toLocaleString()} errors
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === 'usage' && (
            <div className="glass-panel rounded-xl p-6">
              <h3 className="text-sm font-semibold text-white mb-4">Recent requests</h3>
              {loadingUsage ? (
                <p className="text-zinc-500 text-sm">Loading...</p>
              ) : usage.length === 0 ? (
                <p className="text-zinc-500 text-sm">No usage data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead><tr className="text-zinc-500 border-b border-zinc-800"><th className="py-2 pr-4">Path</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Latency</th><th className="py-2">Time</th></tr></thead>
                    <tbody>
                      {usage.map((u) => (
                        <tr key={u.id ?? `${u.created_at}-${u.path}`} className="border-b border-zinc-800/50">
                          <td className="py-2 pr-4 font-mono text-zinc-300">{u.path}</td>
                          <td className="py-2 pr-4">{u.status_code ?? '—'}</td>
                          <td className="py-2 pr-4">{u.latency_ms != null ? `${u.latency_ms}ms` : '—'}</td>
                          <td className="py-2 text-zinc-500">{new Date(u.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {tab === 'audit' && (
            <div className="glass-panel rounded-xl p-6">
              <h3 className="text-sm font-semibold text-white mb-4">Security events</h3>
              {loadingAudit ? (
                <p className="text-zinc-500 text-sm">Loading...</p>
              ) : audit.length === 0 ? (
                <p className="text-zinc-500 text-sm">No audit events yet.</p>
              ) : (
                <ul className="space-y-2">
                  {audit.map((a) => (
                    <li key={a.id} className="flex flex-wrap gap-2 text-xs p-2 rounded bg-zinc-900/50 border border-zinc-800">
                      <span className="font-medium text-[#00e599]">{a.event_type}</span>
                      <span className="text-zinc-500">{new Date(a.created_at).toLocaleString()}</span>
                      {a.ip && <span className="text-zinc-500">{a.ip}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'keys' && newKeyShown && (
        <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-500/50">
          <p className="text-xs text-amber-400 mb-2">Copy your key now — it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-white font-mono break-all bg-black/30 px-2 py-2 rounded">
              {newKeyShown}
            </code>
            <Button size="sm" variant="secondary" onClick={() => copyKey(newKeyShown)}>Copy</Button>
            <Button size="sm" variant="ghost" onClick={() => setNewKeyShown(null)}>Done</Button>
          </div>
        </div>
      )}

      {tab === 'keys' && (
      <div className="glass-panel rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Create key</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-[10px] text-zinc-500 mb-1">Name</label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Production"
              className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white text-sm w-48"
            />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-500 mb-1">Environment</label>
            <select
              value={createEnv}
              onChange={(e) => setCreateEnv(e.target.value as 'live' | 'test')}
              className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-white text-sm"
            >
              <option value="live">Live</option>
              <option value="test">Test</option>
            </select>
          </div>
          <Button onClick={handleCreate} disabled={creating || !createName.trim() || liveBlocked} isLoading={creating}>
            Create key
          </Button>
        </div>
        {liveBlocked && (
          <div className="mt-3 text-xs text-amber-300">
            Live keys require a paid plan. Select <span className="font-semibold">Test</span> or click{' '}
            <a
              className="text-[#00e599] hover:underline"
              href="mailto:founders@p3lending.space?subject=Upgrade%20P3%20Developer%20API%20Plan"
            >
              Upgrade to Paid
            </a>
            .
          </div>
        )}
      </div>
      )}

      {tab === 'keys' && (
      <div className="glass-panel rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Your keys</h3>
        {loading ? (
          <p className="text-zinc-500 text-sm">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="text-zinc-500 text-sm">No API keys yet. Create one above.</p>
        ) : (
          <ul className="space-y-3">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-zinc-900/50 border border-zinc-800"
              >
                <div>
                  <span className="text-sm font-medium text-white">{k.name}</span>
                  <span className="ml-2 text-[10px] text-zinc-500 font-mono">{k.key_prefix}…</span>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    Env: {k.env ?? (k.key_prefix.startsWith('p3_test_') ? 'test' : 'live')} · Scopes: {k.scopes?.join(', ') || '—'} · {k.rpm_limit} rpm, {k.rpd_limit} rpd
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${
                      k.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
                    }`}
                  >
                    {k.status}
                  </span>
                  {k.status === 'active' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => handleRevoke(k.id)}
                      disabled={revokingId === k.id}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      <div className="text-sm text-zinc-500">
        <p>
          Docs &amp; OpenAPI: <a href="https://developers.p3lending.space" target="_blank" rel="noopener noreferrer" className="text-[#00e599] hover:underline">developers.p3lending.space</a>
          {' '}(or <code className="text-zinc-400">/docs/openapi.json</code> on your API host).
        </p>
      </div>
    </div>
  );
};
