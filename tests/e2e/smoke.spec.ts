import { test, expect } from '@playwright/test';

test('first-time users see the pitch deck with investor actions', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Credit based on', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book Calendly Call' })).toHaveAttribute(
    'href',
    'https://calendly.com/admin-p3lending/new-meeting'
  );
  await expect(page.getByRole('link', { name: 'Donate via Stripe' }).first()).toHaveAttribute(
    'href',
    'https://stripe.com/payments/checkout'
  );

  await page.getByRole('button', { name: 'Close pitch deck' }).click();
  await expect(page.getByRole('button', { name: 'Get Early Access' })).toBeVisible();
});

test('landing page renders core beta messaging for returning users', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('p3_has_seen_pitch_deck', 'true');
  });

  await page.goto('/');

  await expect(page.getByText('Early Access Beta')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get Early Access' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sitemap.xml' })).toHaveAttribute('href', '/sitemap.xml');
});
