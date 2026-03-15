import { describe, expect, it } from 'vitest';
import { resolveAuthDestination } from '../../components/AuthCallbackPage';

describe('resolveAuthDestination', () => {
  it('routes to onboarding when no next and onboarding incomplete', () => {
    expect(
      resolveAuthDestination({
        next: null,
        onboardingCompleted: false,
      })
    ).toBe('/onboarding');
  });

  it('routes to dashboard when no next and onboarding complete', () => {
    expect(
      resolveAuthDestination({
        next: null,
        onboardingCompleted: true,
      })
    ).toBe('/dashboard');
  });

  it('prefers explicit next path when safe', () => {
    expect(
      resolveAuthDestination({
        next: '/dashboard',
        onboardingCompleted: false,
      })
    ).toBe('/dashboard');
    expect(
      resolveAuthDestination({
        next: '/profile',
        onboardingCompleted: true,
      })
    ).toBe('/profile');
  });

  it('rejects open-redirect next and falls back to onboarding/dashboard', () => {
    expect(
      resolveAuthDestination({
        next: 'https://evil.com',
        onboardingCompleted: false,
      })
    ).toBe('/onboarding');
    expect(
      resolveAuthDestination({
        next: 'https://evil.com',
        onboardingCompleted: true,
      })
    ).toBe('/dashboard');
    expect(
      resolveAuthDestination({
        next: '//evil.com/path',
        onboardingCompleted: true,
      })
    ).toBe('/dashboard');
    expect(
      resolveAuthDestination({
        next: '/path//double',
        onboardingCompleted: true,
      })
    ).toBe('/dashboard');
    expect(
      resolveAuthDestination({
        next: 'javascript:alert(1)',
        onboardingCompleted: true,
      })
    ).toBe('/dashboard');
  });
});

