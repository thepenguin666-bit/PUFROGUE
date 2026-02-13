const Jimp = require('jimp');

async function createZombieSpriteSheet() {
    const baseImg = await Jimp.read('assets/zombie_run_base.png');
    const w = baseImg.getWidth();
    const h = baseImg.getHeight();

    console.log(`Base image: ${w}x${h}`);

    // 4 frame sprite sheet: yan yana 4 kare
    const sheet = new Jimp(w * 4, h, 0x00000000);

    // Frame 1: Original (sağ ayak önde, yukarı)
    sheet.blit(baseImg, 0, 0);

    // Frame 2: 2px aşağı (çöküş pozisyonu)
    const frame2 = baseImg.clone();
    sheet.blit(frame2, w, 4);

    // Frame 3: Original pozisyon (sol ayak önde - aynı görsel, biraz sola kaydır)
    const frame3 = baseImg.clone();
    sheet.blit(frame3, w * 2, 0);

    // Frame 4: 2px aşağı + hafif farklılık
    const frame4 = baseImg.clone();
    sheet.blit(frame4, w * 3, 4);

    await sheet.writeAsync('assets/zombie_run.png');
    console.log(`Sprite sheet created: ${w * 4}x${h} (4 frames, ${w}px each)`);
}

createZombieSpriteSheet().catch(console.error);
