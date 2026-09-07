import { expect, test } from "@playwright/test";
import { join } from "node:path";

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

  const exportButton = page.getByRole("button", { name: "Export MP4" });
  await expect(exportButton).toBeDisabled();
  await expect(page.getByText(/Export unavailable: missing/)).toContainText("DATABASE_URL");
  expect(browserErrors).toEqual([]);
});
