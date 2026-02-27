import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

const getSiteMode = (): 'main' | 'docs' | 'blog' => {
  if (typeof window === 'undefined') return 'main';
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith('docs.')) return 'docs';
  if (host.startsWith('blog.')) return 'blog';
  return 'main';
};

function DocsHome() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px' }}>
      <h1>Documentation</h1>
      <p>Welcome to P3 Lending Protocol docs. Start here:</p>
      <ul>
        <li><a href="https://developers.p3lending.space">Developer Center</a></li>
        <li><a href="https://api.p3lending.space/docs/openapi.json">OpenAPI JSON</a></li>
        <li><a href="/getting-started">Getting Started</a></li>
        <li><a href="/reputation-score">Reputation Score</a></li>
        <li><a href="/faq">FAQ</a></li>
      </ul>
      <hr />
      <h2 id="getting-started">Getting Started</h2>
      <p>P3 is a reputation-based lending marketplace. Borrowers build portable trust via verified actions and repayment history.</p>
      <h2 id="reputation-score">Reputation Score</h2>
      <p>The score is a 0–1000 composite (trust, risk, capacity) with explainable reasons and caps for new accounts.</p>
      <h2 id="faq">FAQ</h2>
      <p>More content coming soon.</p>
    </div>
  );
}

function BlogHome() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px' }}>
      <h1>Blog</h1>
      <p>Product updates, release notes, and learnings from building P3.</p>
      <div style={{ display: 'grid', gap: 16 }}>
        <article style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Developer API Launch</h2>
          <p><small>Draft • Coming soon</small></p>
          <p>We shipped API keys, rate limits, usage logs, and a playground experience.</p>
        </article>
        <article style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Reputation Scoring: Phase 1</h2>
          <p><small>Draft • Coming soon</small></p>
          <p>We upgraded from a basic heuristic score to a layered 0–1000 model with explanations and snapshots.</p>
        </article>
      </div>
      <p style={{ marginTop: 24 }}>
        Want to publish updates? For now, posts can be authored in markdown later; this page will be replaced by a real blog app.
      </p>
    </div>
  );
}

// Assuming this is the existing homepage component
function ExistingHomeComponent() {
  return (
    <div>
      <h1>Welcome to P3 Lending Protocol</h1>
      <p>Your gateway to decentralized lending.</p>
    </div>
  );
}

export default function App() {
  const siteMode = getSiteMode();

  return (
    <Router>
      <nav>
        <ul style={{ display: 'flex', gap: '1rem', listStyle: 'none', padding: 0 }}>
          <li><Link to="/">Home</Link></li>
          <li><a href="https://docs.p3lending.space" target="_blank" rel="noopener noreferrer">Docs</a></li>
          <li><a href="https://blog.p3lending.space" target="_blank" rel="noopener noreferrer">Blog</a></li>
          {/* Add other nav links here */}
        </ul>
      </nav>
      <Routes>
        <Route
          path="/"
          element={
            siteMode === 'docs'
              ? <DocsHome />
              : siteMode === 'blog'
                ? <BlogHome />
                : <ExistingHomeComponent />
          }
        />
        {/* Explicit routes for docs and blog on main domain */}
        <Route path="/docs" element={<DocsHome />} />
        <Route path="/blog" element={<BlogHome />} />
        {/* Add other routes here */}
      </Routes>
    </Router>
  );
}

# developers.p3lending.space — Netlify + Cloudflare DNS

Deploy the developer center/docs site to Netlify and point the subdomain via Cloudflare.

## Netlify

Create a new Netlify site from the **same GitHub repo**.

Build settings:
- **Base directory:** `apps/developer-docs` (or `apps/developer-center` if you upgraded it)
- **Publish directory:**
  - `public` (if static HTML)
  - or `dist` / `build` depending on your framework
- **Build command:**
  - leave empty for static `public/`
  - or your framework build command

Then in Netlify → **Domain management**, add the custom domain:
- `developers.p3lending.space`

## Cloudflare DNS

In Cloudflare → DNS for `p3lending.space`, add:

| Type  | Name       | Target                        | Proxy | TTL  |
|-------|------------|-------------------------------|-------|------|
| CNAME | developers | <your-dev-site>.netlify.app   | DNS only | Auto |

Use the Netlify-assigned hostname for the developer site (shown in Netlify under the site’s default URL).

## TLS

- Keep Cloudflare proxy **DNS only** for `developers` while Netlify provisions the certificate.
- Once Netlify shows HTTPS active, you can optionally proxy, but DNS-only is simplest.

## Verify

- Open `https://developers.p3lending.space` and confirm the developer center loads.