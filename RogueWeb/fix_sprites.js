// Downgrading is safer than guessing v1 API changes blindly
const Jimp = require('jimp');

async function fixSprites() {
    const inputPath = 'assets/run.png';
    const outputPath = 'assets/run_fixed.png';
    const frameWidth = 754;
    const frameHeight = 754;
    const frameCount = 8;

    try {
        const image = await Jimp.read(inputPath);
        const newImage = new Jimp(image.bitmap.width, image.bitmap.height);

        for (let i = 0; i < frameCount; i++) {
            const x = i * frameWidth;
            const y = 0;

            // Extract frame
            const frame = image.clone().crop(x, y, frameWidth, frameHeight);

            // Find bounding box
            let minX = frameWidth;
            let minY = frameHeight;
            let maxX = 0;
            let maxY = 0;
            let found = false;

            frame.scan(0, 0, frameWidth, frameHeight, function (x, y, idx) {
                const alpha = this.bitmap.data[idx + 3];
                if (alpha > 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                    found = true;
                }
            });

            if (!found) {
                continue; // Empty frame
            }

            const contentWidth = maxX - minX + 1;
            const contentHeight = maxY - minY + 1;

            // Calculate current center
            const centerX = minX + contentWidth / 2;
            const centerY = minY + contentHeight / 2;

            // Target center
            const targetX = frameWidth / 2;
            const targetY = frameHeight / 2;

            // Offset
            const offsetX = targetX - centerX;
            const offsetY = targetY - centerY;

            // Paste centered
            newImage.blit(frame, x + offsetX, y + offsetY);

            console.log(`Frame ${i}: Content ${contentWidth}x${contentHeight} at (${minX},${minY}). Shifted by (${offsetX.toFixed(0)}, ${offsetY.toFixed(0)})`);
        }

        await newImage.writeAsync(outputPath);
        console.log('Fixed sprite sheet saved to ' + outputPath);

    } catch (err) {
        console.error(err);
    }
}

fixSprites();
