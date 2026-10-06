import { expect, test } from '@playwright/test';

/**
 * End-to-end coverage of everything reachable without a database.
 *
 * These run in CI on Ubuntu. They cannot run on the current dev machine, where
 * Playwright has no build for mac12-arm64 (see docs/DECISIONS.md, D-018).
 */

test.describe('Landing page', () => {
  test('hiện hero, ba phương pháp và lối vào đăng nhập', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Học ngôn ngữ bằng cả câu');

    // The three methods keep the names the source material used.
    await expect(page.getByRole('heading', { name: 'Lexical Approach' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '10.000 Sentences / AJATT' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mass Sentences' })).toBeVisible();

    await expect(page.getByRole('link', { name: /Bắt đầu miễn phí/ }).first()).toBeVisible();
  });

  test('mỗi phương pháp có sơ đồ mô tả cơ chế', async ({ page }) => {
    await page.goto('/');
    const diagrams = page.locator('#phuong-phap svg[role="img"]');
    await expect(diagrams).toHaveCount(3);

    // Diagrams carry a title, so they are not decoration to a screen reader.
    for (const title of [
      /nhớ thành một khối/,
      /chỉ thêm đúng một phần mới/,
      /mỗi lần ôn/,
    ]) {
      await expect(page.locator('#phuong-phap svg title', { hasText: title })).toHaveCount(1);
    }
  });

  test('các con số kế hoạch lấy từ config, không viết tay', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('1.800 câu ÷ 20 câu/ngày = 90 ngày, cộng 15 ngày đệm.')).toBeVisible();
  });

  test('điều hướng bằng bàn phím tới được nội dung chính', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: /Bỏ qua, đi tới nội dung chính/ });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.locator('#noi-dung')).toBeVisible();
  });

  test('đổi giao diện sáng/tối và nhớ lựa chọn', async ({ page }) => {
    await page.goto('/');

    const html = page.locator('html');
    const before = await html.getAttribute('class');

    await page.getByRole('button', { name: /Đổi giao diện/ }).click();
    await expect(async () => {
      expect(await html.getAttribute('class')).not.toBe(before);
    }).toPass();

    const after = await html.getAttribute('class');
    await page.reload();
    // The inline head script re-applies the choice before first paint.
    await expect(html).toHaveClass(after ?? '');
  });

  test('hiển thị được trên màn hình điện thoại mà không tràn ngang', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});

test.describe('Đăng nhập', () => {
  test('báo rõ khi dự án chưa cấu hình Supabase thay vì đổ lỗi', async ({ page }) => {
    await page.goto('/dang-nhap');

    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();

    // Without env vars the form is present but disabled, with an explanation.
    const notice = page.getByText('Chưa cấu hình Supabase');
    if (await notice.isVisible()) {
      await expect(page.getByLabel('Địa chỉ email')).toBeDisabled();
    } else {
      await expect(page.getByLabel('Địa chỉ email')).toBeEnabled();
    }
  });

  test('ô email có nhãn và kiểu nhập đúng cho bàn phím điện thoại', async ({ page }) => {
    await page.goto('/dang-nhap');
    const input = page.getByLabel('Địa chỉ email');
    await expect(input).toHaveAttribute('type', 'email');
    await expect(input).toHaveAttribute('inputmode', 'email');
    await expect(input).toHaveAttribute('autocomplete', 'email');
  });
});

test.describe('Trang riêng tư', () => {
  for (const path of ['/bang-dieu-khien', '/bat-dau', '/cai-dat']) {
    test(`${path} chuyển hướng khách chưa đăng nhập về trang đăng nhập`, async ({ page }) => {
      const response = await page.goto(path);
      // Either middleware redirects, or the page itself does once rendered.
      await expect(page).toHaveURL(/dang-nhap/);
      expect(response?.status()).toBeLessThan(400);
    });
  }
});

test.describe('PWA', () => {
  test('manifest hợp lệ và trỏ tới icon có thật', async ({ page, request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const manifest = (await response.json()) as {
      name: string;
      start_url: string;
      display: string;
      icons: Array<{ src: string; purpose?: string }>;
    };

    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/bang-dieu-khien');
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      const iconResponse = await request.get(icon.src);
      expect(iconResponse.ok(), `icon ${icon.src}`).toBe(true);
    }

    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });

  test('trang ngoại tuyến tồn tại để service worker dùng làm dự phòng', async ({ page }) => {
    await page.goto('/ngoai-tuyen');
    await expect(page.getByRole('heading', { name: 'Bạn đang ngoại tuyến' })).toBeVisible();
  });
});
