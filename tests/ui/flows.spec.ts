import { test, expect } from '@playwright/test';

test('ritual flows and responsive navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
  await page.screenshot({ path: '.expo/auth-desktop.png' });
  await page.getByPlaceholder('you@example.com').fill('test');
  await page.getByPlaceholder('Enter your password').fill('test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible();
  console.log(await page.locator('body').ariaSnapshot());
  expect(errors).toEqual([]);
});
