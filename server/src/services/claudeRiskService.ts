import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/config';
import logger from '../utils/logger';

export interface RiskFactor {
  category: 'MACRO' | 'ON-CHAIN' | 'BEHAVIORAL';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  sourceUrl?: string;
}

export interface RiskReport {
  compositeScore: number;
  macroScore: number;
  walletScore: number;
  factors: RiskFactor[];
  summary: string;
  timestamp: string;
}

export interface UserRiskInput {
  walletAgeDays?: number;
  txCount?: number;
  successfulRepayments?: number;
  currentStreak?: number;
  kycStatus?: string;
  income?: number;
  employmentStatus?: string;
}

const FALLBACK_REPORT = (reason: string): RiskReport => ({
  compositeScore: 50,
  macroScore: 50,
  walletScore: 50,
  factors: [{ category: 'MACRO', severity: 'MEDIUM', description: reason }],
  summary: reason,
  timestamp: new Date().toISOString(),
});

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = config.developerApi.anthropicApiKey;
  if (!apiKey) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Performs a comprehensive risk assessment for a lending applicant using
 * Claude Opus 4.6 with web search for real-time market conditions.
 */
export async function analyzeRiskProfile(input: UserRiskInput): Promise<RiskReport> {
  const client = getClient();
  if (!client) {
    return FALLBACK_REPORT('Claude API key not configured. Set ANTHROPIC_API_KEY in server/.env.');
  }

  const userDataBlock = `
Wallet Age: ${input.walletAgeDays ?? 30} days
Transaction Count: ${input.txCount ?? 5} lifetime txs
Successful Repayments: ${input.successfulRepayments ?? 0}, Streak: ${input.currentStreak ?? 0}
KYC Status: ${input.kycStatus ?? 'unverified'}
Annual Income: ${input.income ? `$${input.income}` : 'not provided'}
Employment Status: ${input.employmentStatus ?? 'unknown'}
`.trim();

  const systemPrompt = `You are a risk analyst for P3 Lending Protocol, a peer-to-peer lending platform.
Your task is to produce a structured JSON risk report by combining:
1. Real-time macro conditions (crypto market volatility, DeFi risk events, US regulatory news) retrieved via web search
2. The applicant's on-chain and KYC profile data provided by the user

SCORING RULES (compositeScore: 0 = very safe, 100 = extremely risky):
- walletScore is based purely on the on-chain profile data
- macroScore reflects current market/regulatory conditions (use web search)
- compositeScore = weighted average (60% walletScore + 40% macroScore)
- Low wallet age (< 90 days) adds +15 to walletScore
- Unverified KYC adds +20 to walletScore
- Verified KYC (tier 2+) subtracts -10 from walletScore
- Each successful repayment subtracts -5 (up to -25) from walletScore
- Active repayment streak (>2) subtracts -10 from walletScore

Always output valid JSON matching the required schema.`;

  const userMessage = `Conduct a risk assessment for this P3 Lending applicant.

USER ON-CHAIN DATA:
${userDataBlock}

Search for current (as of today) information on:
1. Crypto market volatility index / DeFi risk conditions
2. Recent major DeFi hacks or exploits (last 30 days)
3. US regulatory crackdowns on crypto lending

Then produce a JSON risk report with this exact structure:
{
  "compositeScore": <number 0-100>,
  "macroScore": <number 0-100>,
  "walletScore": <number 0-100>,
  "factors": [
    {
      "category": "MACRO" | "ON-CHAIN" | "BEHAVIORAL",
      "severity": "LOW" | "MEDIUM" | "HIGH",
      "description": "<explanation>",
      "sourceUrl": "<url if from web search, omit otherwise>"
    }
  ],
  "summary": "<2-3 sentence risk summary>"
}`;

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      tools: [
        { type: 'web_search_20260209', name: 'web_search' } as any,
      ],
      messages: [{ role: 'user', content: userMessage }],
    });

    const response = await stream.finalMessage();

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const report = JSON.parse(jsonMatch[0]) as RiskReport;
    report.timestamp = new Date().toISOString();
    return report;
  } catch (error: any) {
    logger.error('Claude risk analysis error:', error);
    if (error instanceof Anthropic.AuthenticationError) {
      return FALLBACK_REPORT('Invalid Anthropic API key. Check ANTHROPIC_API_KEY in server/.env.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      return FALLBACK_REPORT('Claude API rate limit reached. Please retry shortly.');
    }
    if (error instanceof Anthropic.APIError) {
      return FALLBACK_REPORT(`Claude API error (${error.status}): ${error.message}`);
    }
    return FALLBACK_REPORT(`Risk analysis failed: ${error?.message ?? 'Unknown error'}`);
  }
}
