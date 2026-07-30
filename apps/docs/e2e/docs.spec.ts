import { expect, test } from '@playwright/test';

test('published route renders body, distinct IDs, source metadata, and skip link', async ({
  page,
}) => {
  const response = await page.goto('/lessons/javascript/functions/closure-private-state/');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('RELEASE_ZERO_CLOSURE_BODY')).toBeVisible();
  await expect(page.getByText('lesson-js-closure-private-state', { exact: true })).toBeVisible();
  await expect(
    page.getByText('curriculum/lessons/lesson-js-closure-private-state.md'),
  ).toBeVisible();
  expect(page.url()).not.toContain('lesson-js-closure-private-state');
  await expect(page.locator('h1#_top')).toBeVisible();

  const sidebarLabels = await page
    .locator('a')
    .evaluateAll((links) => links.map((link) => link.textContent.trim()));
  const functionValuesIndex = sidebarLabels.indexOf('Function như một giá trị');
  const closureIndex = sidebarLabels.indexOf('Closure và private state');
  expect(functionValuesIndex).toBeGreaterThanOrEqual(0);
  expect(closureIndex).toBeGreaterThan(functionValuesIndex);

  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
});

test('draft route is absent from a production build', async ({ page }) => {
  const response = await page.goto('/lessons/release-zero/draft/');
  const status = response?.status();
  const markerCount = await page.getByText('RELEASE_ZERO_DRAFT_BODY').count();
  expect({ status, markerCount }).toEqual({ status: 404, markerCount: 0 });
});
