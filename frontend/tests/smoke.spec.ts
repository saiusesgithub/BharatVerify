import { test, expect } from '@playwright/test';

const FRONTEND = process.env.FRONTEND_BASE || 'http://localhost:5173';

test('admin can login and see dashboard', async ({ page }) => {
  await page.goto(`${FRONTEND}/login`);
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Admin Dashboard')).toBeVisible();
});

test('verifier can login and verify form appears', async ({ page }) => {
  await page.goto(`${FRONTEND}/login`);
  await page.getByLabel('Email').fill('verifier@example.com');
  await page.getByLabel('Password').fill('Pass@123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Verifier Dashboard')).toBeVisible();
  await expect(page.getByText('Verify Certificate')).toBeVisible();
});

