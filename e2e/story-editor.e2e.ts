import { expect, test } from "@playwright/test";
import { join } from "node:path";

declare global {
  interface Window {
    __storyPreview?: {
      seek: (frame: number) => void;
      play: () => void;
      pause: () => void;
      getCurrentFrame: () => number | null;
    };
  }
}

test("selects media, edits transcript, prepares preview, and validates export config", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");

  const transcript = page.getByLabel("Transcript");
  await transcript.fill("An original fixture story.\n\nMeasured in the browser.");
  await expect(transcript).toHaveValue(/Measured in the browser/);

  const imageInput = page.getByLabel("Background image");
  const audioInput = page.getByLabel("Narration audio");
  await imageInput.setInputFiles(join(process.cwd(), "e2e", "fixtures", "background.png"));
  await audioInput.setInputFiles(join(process.cwd(), "e2e", "fixtures", "narration.wav"));

  await expect(page.getByText("background.png")).toBeVisible();
  await expect(page.getByText(/narration\.wav/)).toBeVisible();
  const preview = page.getByRole("region", { name: "Video preview" });
  await expect(preview).toHaveAttribute("data-ready", "true");
  const image = preview.locator("img").first();
  await expect(image).toBeVisible();
  await expect.poll(() =>
    image.evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      return element.complete && element.naturalWidth > 0 && element.naturalHeight > 0;
    }),
  ).toBe(true);
  await expect.poll(() => preview.locator("video, audio").count()).toBeGreaterThan(0);
  await expect(page.getByText(/· 60 fps/)).toBeVisible();

  const scroller = preview.locator("[data-credits-scroller]");
  await expect(scroller).toBeVisible();
  await expect(scroller).toHaveAttribute("style", /translate3d\(0px,/);
  const readY = async () => Number(await scroller.getAttribute("data-scroll-y"));
  const startY = await readY();
  expect(Number.isFinite(startY)).toBe(true);

  await expect.poll(() => page.evaluate(() => Boolean(window.__storyPreview))).toBe(true);
  await page.evaluate(() => window.__storyPreview?.seek(10_000));
  const endY = await readY();
  expect(endY).toBeLessThan(startY);

  await page.evaluate(() => window.__storyPreview?.seek(0));
  await expect.poll(readY).toBeCloseTo(startY, 5);

  await page.evaluate(() => window.__storyPreview?.seek(15));
  const midY = await readY();
  expect(midY).toBeLessThan(startY);
  expect(midY).toBeGreaterThan(endY);

  await page.evaluate(() => window.__storyPreview?.play());
  await expect.poll(readY).toBeLessThan(startY);
  const playingY = await readY();
  await page.evaluate(() => window.__storyPreview?.pause());
  const pausedY = await readY();
  expect(Math.abs(pausedY - playingY)).toBeLessThan(40);
  await page.evaluate(() => window.__storyPreview?.seek(0));
  await expect.poll(readY).toBeCloseTo(startY, 5);

  const exportButton = page.getByRole("button", { name: "Export MP4" });
  await expect(exportButton).toBeDisabled();
  await expect(page.getByText(/Export unavailable: missing/)).toContainText("BLOB_READ_WRITE_TOKEN");
  expect(browserErrors).toEqual([]);
});
