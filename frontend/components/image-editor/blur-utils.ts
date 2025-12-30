/**
 * Blur Utilities
 * Optimized blur algorithms for image processing
 */

/**
 * Box Blur Algorithm - Simple and robust
 * Works correctly for any size region extracted via getImageData
 * Uses separable passes (horizontal then vertical) for O(n*r) efficiency
 *
 * @param imageData - ImageData object to blur in place
 * @param width - Width of the image region
 * @param height - Height of the image region
 * @param radius - Blur radius (1+)
 */
export function stackBlur(
  imageData: ImageData,
  width: number,
  height: number,
  radius: number
): void {
  if (width <= 0 || height <= 0 || radius <= 0) return;

  const pixels = imageData.data;

  // Clamp radius to reasonable bounds - must be smaller than dimensions
  const r = Math.min(
    Math.max(1, Math.floor(radius)),
    Math.floor(Math.min(width, height) / 2) - 1,
    127
  );

  if (r <= 0) return;

  // Create working buffer for intermediate results
  const buffer = new Uint8ClampedArray(pixels.length);

  // Horizontal pass - blur each row
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        aSum = 0,
        count = 0;

      // Sample pixels in horizontal direction
      for (let dx = -r; dx <= r; dx++) {
        const sx = Math.max(0, Math.min(width - 1, x + dx));
        const idx = (y * width + sx) * 4;
        rSum += pixels[idx];
        gSum += pixels[idx + 1];
        bSum += pixels[idx + 2];
        aSum += pixels[idx + 3];
        count++;
      }

      const outIdx = (y * width + x) * 4;
      buffer[outIdx] = Math.round(rSum / count);
      buffer[outIdx + 1] = Math.round(gSum / count);
      buffer[outIdx + 2] = Math.round(bSum / count);
      buffer[outIdx + 3] = Math.round(aSum / count);
    }
  }

  // Vertical pass - blur each column using the horizontal result
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        aSum = 0,
        count = 0;

      // Sample pixels in vertical direction from buffer
      for (let dy = -r; dy <= r; dy++) {
        const sy = Math.max(0, Math.min(height - 1, y + dy));
        const idx = (sy * width + x) * 4;
        rSum += buffer[idx];
        gSum += buffer[idx + 1];
        bSum += buffer[idx + 2];
        aSum += buffer[idx + 3];
        count++;
      }

      // Write back to original pixels array
      const outIdx = (y * width + x) * 4;
      pixels[outIdx] = Math.round(rSum / count);
      pixels[outIdx + 1] = Math.round(gSum / count);
      pixels[outIdx + 2] = Math.round(bSum / count);
      pixels[outIdx + 3] = Math.round(aSum / count);
    }
  }
}

/**
 * Pixelate effect - sample center pixel of each block
 * O(n) complexity
 *
 * @param imageData - ImageData object to pixelate in place
 * @param width - Width of the image region
 * @param height - Height of the image region
 * @param pixelSize - Size of each pixel block
 */
export function pixelate(
  imageData: ImageData,
  width: number,
  height: number,
  pixelSize: number
): void {
  if (width <= 0 || height <= 0 || pixelSize <= 1) return;

  const pixels = imageData.data;

  for (let y = 0; y < height; y += pixelSize) {
    for (let x = 0; x < width; x += pixelSize) {
      const blockWidth = Math.min(pixelSize, width - x);
      const blockHeight = Math.min(pixelSize, height - y);

      // Sample the center pixel of each block
      const centerX = x + Math.floor(blockWidth / 2);
      const centerY = y + Math.floor(blockHeight / 2);
      const centerIdx = (centerY * width + centerX) * 4;

      const r = pixels[centerIdx];
      const g = pixels[centerIdx + 1];
      const b = pixels[centerIdx + 2];
      const a = pixels[centerIdx + 3];

      // Fill the entire block with the sampled color
      for (let by = 0; by < blockHeight; by++) {
        for (let bx = 0; bx < blockWidth; bx++) {
          const idx = ((y + by) * width + (x + bx)) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = a;
        }
      }
    }
  }
}
