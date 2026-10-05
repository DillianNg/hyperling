import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility checks that do not need a database.
 *
 * These assert the structural things a learner using a screen reader or a
 * keyboard depends on, rather than running a generic auditor: a failure here
 * names the actual problem.
 */

const PUBLIC_PAGES = ['/', '/dang-nhap', '/ngoai-tuyen'];

async function headingLevels(page: Page): Promise<number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((el) => Number(el.tagName[1])),
  );
}

test.describe('Accessibility', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} có đúng một h1 và thứ bậc tiêu đề không nhảy cóc`, async ({ page }) => {
      await page.goto(path);

      const levels = await headingLevels(page);
      expect(levels.filter((level) => level === 1)).toHaveLength(1);

      // A jump from h2 straight to h4 leaves a screen-reader user guessing.
      for (let i = 1; i < levels.length; i += 1) {
        expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
      }
    });

    test(`${path} đặt đúng ngôn ngữ trang`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('lang', /vi|en/);
    });

    test(`${path} không có ảnh nào thiếu mô tả`, async ({ page }) => {
      await page.goto(path);
      const missing = await page.evaluate(
        () =>
          [...document.querySelectorAll('img')].filter(
            (img) => !img.alt && img.getAttribute('aria-hidden') !== 'true',
          ).length,
      );
      expect(missing).toBe(0);
    });

    test(`${path} mọi nút đều có tên đọc được`, async ({ page }) => {
      await page.goto(path);
      const unnamed = await page.evaluate(
        () =>
          [...document.querySelectorAll('button')].filter((button) => {
            const label =
              button.getAttribute('aria-label') ??
              button.getAttribute('title') ??
              button.textContent?.trim();
            return !label;
          }).length,
      );
      expect(unnamed).toBe(0);
    });
  }

  test('vùng chạm trên điện thoại đủ lớn để bấm bằng ngón cái', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dang-nhap');

    // 44px is the long-standing minimum for a comfortable touch target.
    const tooSmall = await page.evaluate(() =>
      [...document.querySelectorAll('button, a[href], input')]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return false;
          return rect.height < 44;
        })
        .map((el) => el.tagName + (el.textContent?.trim().slice(0, 20) ?? '')),
    );
    expect(tooSmall).toEqual([]);
  });

  test('focus luôn nhìn thấy được khi đi bằng bàn phím', async ({ page }) => {
    await page.goto('/dang-nhap');

    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      const hasVisibleOutline = await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return true;
        const style = getComputedStyle(active);
        return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
      });
      expect(hasVisibleOutline, `phần tử thứ ${i + 1} khi nhấn Tab`).toBe(true);
    }
  });

  test('tôn trọng lựa chọn giảm chuyển động của hệ điều hành', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const animated = await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((el) => {
        const style = getComputedStyle(el);
        const duration = parseFloat(style.transitionDuration) + parseFloat(style.animationDuration);
        return duration > 0.05;
      }).length,
    );
    expect(animated).toBe(0);
  });

  test('cho phép phóng to trang — không khoá zoom', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).not.toContain('user-scalable=no');
    expect(viewport).not.toMatch(/maximum-scale=1(\.0)?\b/);
  });
});
