import { expect, test } from "@playwright/test";
import { join } from "node:path";

test("selects media, edits transcript, prepares preview, and validates export config", async ({ page }) => {
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
  await expect(page.getByRole("region", { name: "Video preview" })).toHaveAttribute("data-ready", "true");
  await expect.poll(
    () => page.getByRole("region", { name: "Video preview" }).locator("img").first()
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);

  const exportButton = page.getByRole("button", { name: "Export MP4" });
  await expect(exportButton).toBeDisabled();
  await expect(page.getByText(/Export unavailable: missing/)).toContainText("DATABASE_URL");
});
