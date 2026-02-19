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

  it('prefers explicit next path', () => {
    expect(
      resolveAuthDestination({
        next: '/dashboard',
        onboardingCompleted: false,
      })
    ).toBe('/dashboard');
  });
});

