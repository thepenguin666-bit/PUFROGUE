const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Tam ekran yap
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Pencere boyutu değişirse canvas'ı güncelle
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Görselleri Yükle
const assets = {};
const imageSources = {
    bg: 'assets/bg1.png',
    idle: 'assets/idle.png',
    head: 'assets/head.png',
    run: 'assets/run.png',
    jump: 'assets/jump.png',
    attack1: 'assets/attack1.png',
    attack2: 'assets/attack2.png',
    attack3: 'assets/attack3.png'
};

let imagesLoaded = 0;
const totalImages = Object.keys(imageSources).length;

function loadImages(callback) {
    for (const [key, src] of Object.entries(imageSources)) {
        const img = new Image();
        img.src = src;
        img.onload = () => {
            assets[key] = img;
            imagesLoaded++;
            if (imagesLoaded === totalImages) {
                callback();
            }
        };
    }
}

// Oyun Durumu
const state = {
    x: 0,
    facingRight: true,
    isRunning: false,
    isAttacking: false,
    attackStage: 0,
    attackTimer: 0,
    shakeTimer: 0,
    // Jump properties
    y: 0,
    vy: 0,
    isJumping: false,
    isAirAttacking: false
};

// Ayarlar
const SPEED = 10;
const ATTACK_DELAY = 18;
const SHAKE_INTENSITY = 5;
const GRAVITY = 0.8;
const FALL_GRAVITY = 1.6;
const JUMP_POWER = -25;
const CHARACTER_SCALE = 0.5; // Karakter yarı boyut

// Spritesheet Ayarları
const RUN_FRAMES = 8;
let runFrameIndex = 0;
let runFrameTimer = 0;
const RUN_ANIM_SPEED = 5;

// Tuş Kontrolü
const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;

    // Zıplama Tetikleyicisi
    if (e.key === 'ArrowUp' && !state.isJumping && !state.isAttacking) {
        state.isJumping = true;
        state.vy = JUMP_POWER;
        state.isRunning = false;
    }

    // Havada 'a' basılırsa -> air attack (sadece attack3)
    if (e.key.toLowerCase() === 'a' && state.isJumping && !state.isAirAttacking) {
        state.isAirAttacking = true;
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

function update() {
    // Havadayken ayrı mantık
    if (state.isJumping) {
        // Zıplama Fiziği
        if (state.vy < 0) {
            state.vy += GRAVITY;
        } else {
            state.vy += FALL_GRAVITY;
        }
        state.y += state.vy;

        // Yere düşme kontrolü
        if (state.y >= 0) {
            state.y = 0;
            state.vy = 0;
            state.isJumping = false;
            state.isAirAttacking = false;
        }

        // Havada sağa/sola hareket
        if (keys['arrowright']) {
            state.x -= SPEED;
            state.facingRight = true;
        } else if (keys['arrowleft']) {
            state.x += SPEED;
            state.facingRight = false;
        }

        return;
    }

    // === Yerdeki Mantık ===

    // Attack Mantığı - sadece 'a' basılı tutulduğu sürece ilerle
    if (keys['a']) {
        if (!state.isAttacking) {
            // İlk basışta attack başlat
            state.isAttacking = true;
            state.attackStage = 1;
            state.attackTimer = 0;
        }

        // Tuş basılı tutuluyorsa zamanlayıcıyı ilerlet
        state.attackTimer++;

        // Titreme efekti
        if (state.attackTimer > ATTACK_DELAY - 5 && state.attackTimer < ATTACK_DELAY) {
            state.shakeTimer = SHAKE_INTENSITY;
        } else {
            state.shakeTimer = 0;
        }

        // Zamanlayıcı dolduğunda bir sonraki stage'e geç
        if (state.attackTimer >= ATTACK_DELAY) {
            state.attackTimer = 0;
            state.attackStage++;
            if (state.attackStage > 3) {
                state.attackStage = 1; // 3'ten sonra 1'e dön (loop)
            }
        }

        state.isRunning = false;
    } else {
        // 'a' tuşu bırakıldığında attack hemen bitsin
        if (state.isAttacking) {
            state.isAttacking = false;
            state.attackStage = 0;
            state.attackTimer = 0;
            state.shakeTimer = 0;
        }

        // Hareket Mantığı (Attack yoksa)
        state.isRunning = false;
        if (keys['arrowright']) {
            state.x -= SPEED;
            state.facingRight = true;
            state.isRunning = true;
        } else if (keys['arrowleft']) {
            state.x += SPEED;
            state.facingRight = false;
            state.isRunning = true;
        }

        // Koşma Animasyonu
        if (state.isRunning) {
            runFrameTimer++;
            if (runFrameTimer >= RUN_ANIM_SPEED) {
                runFrameIndex = (runFrameIndex + 1) % RUN_FRAMES;
                runFrameTimer = 0;
            }
        } else {
            runFrameIndex = 0;
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Titreme Efekti
    let shakeX = 0;
    let shakeY = 0;
    if (state.shakeTimer > 0) {
        shakeX = (Math.random() - 0.5) * state.shakeTimer;
        shakeY = (Math.random() - 0.5) * state.shakeTimer;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // 1. Arkaplanı Çiz
    if (assets.bg) {
        const bgH_original = assets.bg.height;
        const bgW_original = assets.bg.width;

        const scale = canvas.height / bgH_original;
        const bgH = canvas.height;
        const bgW = bgW_original * scale;

        let relativeX = state.x % bgW;
        if (relativeX > 0) relativeX -= bgW;

        for (let i = relativeX; i < canvas.width; i += bgW) {
            ctx.drawImage(assets.bg, i, 0, bgW, bgH);
        }
    }

    // 2. Karakteri Çiz
    const charX = canvas.width / 2;
    const charY = (canvas.height / 2 + 210) + state.y;

    ctx.save();
    ctx.translate(charX, charY);

    if (!state.facingRight) {
        ctx.scale(-1, 1);
    }

    // Hangi görsel?
    let currentImg = assets.idle;

    let drawX = 0;
    let drawY = 0;

    if (state.isJumping) {
        if (state.isAirAttacking) {
            currentImg = assets.attack3;
        } else {
            currentImg = assets.jump;
        }
    } else if (state.isAttacking) {
        if (state.attackStage === 1) currentImg = assets.attack1;
        else if (state.attackStage === 2) currentImg = assets.attack2;
        else if (state.attackStage === 3) currentImg = assets.attack3;
    } else if (state.isRunning) {
        currentImg = assets.run;
    }

    if (currentImg) {
        if (state.isRunning && !state.isAttacking && !state.isJumping) {
            // Spritesheet çizimi (ölçekli)
            const frameW = currentImg.width / RUN_FRAMES;
            const frameH = currentImg.height;
            const scaledW = frameW * CHARACTER_SCALE;
            const scaledH = frameH * CHARACTER_SCALE;
            drawX = -scaledW / 2;
            drawY = -scaledH / 2;

            ctx.drawImage(
                currentImg,
                runFrameIndex * frameW, 0, frameW, frameH,
                drawX, drawY, scaledW, scaledH
            );

            // Koşarken kafayı da çiz
            if (assets.head) {
                const pulseScale = (Math.floor(Date.now() / 380) % 2 === 0) ? 1.01 : 0.98;

                const headW = scaledW * pulseScale;
                const headH = scaledH * pulseScale;

                const headX = drawX + (scaledW - headW) / 2;
                const headY = drawY + (scaledH - headH) / 2;

                ctx.drawImage(assets.head, headX, headY, headW, headH);
            }
        } else {
            // Tek resim çizimi (idle, attack, jump) - ölçekli
            const scaledW = currentImg.width * CHARACTER_SCALE;
            const scaledH = currentImg.height * CHARACTER_SCALE;
            drawX = -scaledW / 2;
            drawY = -scaledH / 2;
            ctx.drawImage(currentImg, drawX, drawY, scaledW, scaledH);
        }
    }

    ctx.restore();
    ctx.restore();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Başlat
loadImages(() => {
    loop();
});
