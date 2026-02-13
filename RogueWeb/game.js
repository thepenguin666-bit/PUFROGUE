const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 16:9 Sabit Oran Koruması
// Mevcut ekran yüksekliğini referans alarak 16:9 bir alan oluşturuyoruz
// Böylece mevcut dikey ayarlar (zemin, zıplama vs) bozulmaz
const REF_DPR = window.devicePixelRatio || 1;
const TARGET_HEIGHT = window.screen.height; // Referans yükseklik
const TARGET_WIDTH = Math.round(TARGET_HEIGHT * 16 / 9); // 16:9 oranına göre genişlik

// Dahili çözünürlük sabit (yüksek kalite için dpr ile çarpılabilir ama şimdilik screen resolution yeterli)
// Performans için dpr'yi burada kullanmayıp CSS ile halledebiliriz, ama keskinlik için:
canvas.width = Math.round(TARGET_WIDTH * REF_DPR);
canvas.height = Math.round(TARGET_HEIGHT * REF_DPR);

// Referans değerimiz artık bu sabit yükseklik
const REF_HEIGHT = canvas.height;

function updateCanvasStyle() {
    // Canvas'ı ekrana sığdır (Letterbox / Contain)
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const winRatio = winW / winH;
    const targetRatio = 16 / 9;

    let newStyleWidth, newStyleHeight;

    if (winRatio > targetRatio) {
        // Ekran daha geniş -> Yüksekliğe göre sığdır
        newStyleHeight = winH;
        newStyleWidth = winH * targetRatio;
    } else {
        // Ekran daha dar -> Genişliğe göre sığdır
        newStyleWidth = winW;
        newStyleHeight = winW / targetRatio;
    }

    canvas.style.width = newStyleWidth + 'px';
    canvas.style.height = newStyleHeight + 'px';

    // Ortalamak için margin (CSS flex ile de yapılabilir ama garanti olsun)
    // style.css'de flex var zaten
}

updateCanvasStyle();
window.addEventListener('resize', updateCanvasStyle);

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
    attack3: 'assets/attack3.png',
    zombieIdle: 'assets/zombie_idle.png',
    zombieRun: 'assets/zombie_run.png',
    zombieAttack1: 'assets/zombie_attack1.png',
    zombieAttack2: 'assets/zombie_attack2.png',
    plant: 'assets/plant.png'
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
    y: 0,
    vy: 0,
    isJumping: false,
    isAirAttacking: false,
    jumpCount: 0,
    currentGround: 0,
    onPlatform: false,
    lastHitFrame: -1,
    // Dash sistemi
    isDashing: false,
    dashTimer: 0,
    dashDirection: 1, // 1: sağ, -1: sol
    dashFrameIndex: 0, // Dash sırasında sabit kalan run frame
    preDashVy: 0 // Dash öncesi dikey hız
};

// Dash Ayarları
const DASH_SPEED = 35;
const DASH_DURATION = 10; // Frame
const DASH_COOLDOWN = 20;
const DASH_STAMINA_COST = 2;
let dashCooldownTimer = 0;
let spaceWasReleased = true;

// Dash rüzgar partikülleri
const dashParticles = [];

// Oyuncu Can Sistemi
const PLAYER_MAX_HP = 7;
let playerHP = PLAYER_MAX_HP;
let playerHitCooldown = 0;
const PLAYER_HIT_COOLDOWN = 40;

// Stamina Sistemi
const PLAYER_MAX_STAMINA = 15;
let playerStamina = PLAYER_MAX_STAMINA;
let staminaRegenTimer = 0;
const STAMINA_REGEN_RATE = 30; // Her 30 frame'de (0.5 saniye) 1 stamina = saniyede 2

// Ayarlar
const SPEED = 10;
const ATTACK_DELAY = 18;
const SHAKE_INTENSITY = 5;
const GRAVITY = 0.8;
const FALL_GRAVITY = 1.6;
const JUMP_POWER = -29;
const CHARACTER_SCALE = 0.5;
const PLATFORM_Y = -545;
const GROUND_OFFSET_BASE = 590;

// Ölçek yardımcı fonksiyonları - SABİT referans yüksekliğe göre
// Pencere boyutu değişse de ölçek değişmez, sadece görünen alan değişir
function getScale() {
    return (assets.bg && assets.bg.height > 0) ? (REF_HEIGHT / assets.bg.height) : 1;
}
function getGroundOffset() {
    return GROUND_OFFSET_BASE * getScale();
}

// Platform Boşluk Bölgesi
const PLATFORM_GAP_START = 4360;
const PLATFORM_GAP_END = 8260;

function isPlatformAvailable() {
    if (!assets.bg) return true;
    const bgW_original = assets.bg.width;
    let worldX = -state.x;
    const scale = getScale();
    let bgX = worldX / scale;
    bgX = bgX % bgW_original;
    if (bgX < 0) bgX += bgW_original;
    return !(bgX >= PLATFORM_GAP_START && bgX <= PLATFORM_GAP_END);
}

// Düşmanlar için dünya X koordinatına göre platform kontrolü
function isPlatformAtWorldX(enemyWorldX) {
    if (!assets.bg) return true;
    const bgW_original = assets.bg.width;
    const scale = getScale();
    let bgX = enemyWorldX / scale;
    bgX = bgX % bgW_original;
    if (bgX < 0) bgX += bgW_original;
    return !(bgX >= PLATFORM_GAP_START && bgX <= PLATFORM_GAP_END);
}

// Spritesheet Ayarları
const RUN_FRAMES = 8;
let runFrameIndex = 0;
let runFrameTimer = 0;
const RUN_ANIM_SPEED = 5;

// Kamera
let cameraY = GROUND_OFFSET_BASE;

// === DÜŞMAN SİSTEMİ ===
const ENEMY_SCALE = 0.5;
const ENEMY_SPEED = 3;
const ZOMBIE_RUN_FRAMES = 4;
const ZOMBIE_ANIM_SPEED = 8;
const ENEMY_DETECT_RANGE = 600;
const ENEMY_COUNT = 8;

// Savaş Ayarları
const ENEMY_MAX_HP = 4;
const KNOCKBACK_DIST = 20;
const STUN_DURATION = 12;
const ATTACK_HITBOX_RANGE = 180;
const DEATH_DURATION = 30;

// Düşman saldırı ayarları
const ZOMBIE_ATTACK_RANGE = 80; // Ne kadar yaklaşırsa saldırır
const ZOMBIE_ATTACK_DELAY = 16; // Attack1 -> Attack2 geçiş süresi
const ZOMBIE_ATTACK_HITBOX = 120;
const ZOMBIE_ATTACK_COOLDOWN = 50;

// === PLANT DÜŞMAN SİSTEMİ ===
const PLANT_SCALE = 0.45;
const PLANT_HP = 2;
const PLANT_COUNT = 4; // Başlangıçta spawn
const PLANT_FIRE_RATE = 40; // Her 40 frame'de ateş = 2 saniyede 3
const PLANT_PROJECTILE_SPEED = 6;
const PLANT_PROJECTILE_SIZE = 20;
const PLANT_DETECT_RANGE = 1200;

const plants = [];
const plantProjectiles = [];

let frameCount = 0;
const ENEMY_SPAWN_AHEAD = 2000;
let furthestSpawnedRight = 5000;
let furthestSpawnedLeft = -3000;

const enemies = [];

function createEnemy(worldX, worldY) {
    enemies.push({
        worldX: worldX,
        worldY: worldY,
        facingRight: Math.random() > 0.5,
        isChasing: false,
        frameIndex: 0,
        frameTimer: 0,
        hp: ENEMY_MAX_HP,
        stunTimer: 0,
        isStunned: false,
        isDying: false,
        deathTimer: 0,
        isDead: false,
        lastHitStage: -1,
        vy: 0,
        isFalling: false,
        // Düşman saldırı sistemi
        isAttacking: false,
        attackStage: 0, // 0: yok, 1: attack1, 2: attack2
        attackTimer: 0,
        attackCooldown: 0,
        hasDealtDamage: false // Bu saldırı döngüsünde hasar verdi mi
    });
}

function spawnEnemies() {
    for (let i = 0; i < ENEMY_COUNT; i++) {
        let worldX = (Math.random() - 0.3) * 8000;
        if (Math.abs(worldX) < 500) worldX += 800 * (Math.random() > 0.5 ? 1 : -1);

        let worldY = 0;
        if (Math.random() < 0.4) {
            worldY = PLATFORM_Y;
        }

        createEnemy(worldX, worldY);
    }

    // Plant düşmanları
    for (let i = 0; i < PLANT_COUNT; i++) {
        let worldX = (Math.random() - 0.3) * 8000;
        if (Math.abs(worldX) < 600) worldX += 900 * (Math.random() > 0.5 ? 1 : -1);
        let worldY = 0;
        if (Math.random() < 0.4 && isPlatformAtWorldX(worldX)) {
            worldY = PLATFORM_Y;
        }
        createPlant(worldX, worldY);
    }
}

function dynamicSpawn() {
    const playerWorldX = -state.x;

    if (playerWorldX + ENEMY_SPAWN_AHEAD > furthestSpawnedRight) {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const spawnX = furthestSpawnedRight + 300 + Math.random() * 800;
            const worldY = Math.random() < 0.35 ? PLATFORM_Y : 0;
            createEnemy(spawnX, worldY);
        }
        // Dinamik plant spawn (sağ)
        if (Math.random() < 0.5) {
            const spawnX = furthestSpawnedRight + 400 + Math.random() * 600;
            const worldY = (Math.random() < 0.35 && isPlatformAtWorldX(spawnX)) ? PLATFORM_Y : 0;
            createPlant(spawnX, worldY);
        }
        furthestSpawnedRight += 1500;
    }

    if (playerWorldX - ENEMY_SPAWN_AHEAD < furthestSpawnedLeft) {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const spawnX = furthestSpawnedLeft - 300 - Math.random() * 800;
            const worldY = Math.random() < 0.35 ? PLATFORM_Y : 0;
            createEnemy(spawnX, worldY);
        }
        // Dinamik plant spawn
        if (Math.random() < 0.5) {
            const spawnX = furthestSpawnedLeft - 200 - Math.random() * 600;
            const worldY = (Math.random() < 0.35 && isPlatformAtWorldX(spawnX)) ? PLATFORM_Y : 0;
            createPlant(spawnX, worldY);
        }
        furthestSpawnedLeft -= 1500;
    }
}

// === PLANT FONKSİYONLARI ===
function createPlant(worldX, worldY) {
    plants.push({
        worldX: worldX,
        worldY: worldY,
        hp: PLANT_HP,
        isDying: false,
        deathTimer: 0,
        isDead: false,
        fireTimer: Math.floor(Math.random() * PLANT_FIRE_RATE), // Desenkronize ateş
        swayPhase: Math.random() * Math.PI * 2,
        lastHitStage: -1,
        isStunned: false,
        stunTimer: 0,
        facingRight: Math.random() > 0.5
    });
}

function updatePlants() {
    const playerWorldX = -state.x;
    const playerWorldY = state.y;

    // Plant saldırı çarpışma kontrolü (oyuncu saldırısı)
    const isGroundAttack = state.isAttacking && state.attackStage > 0;
    const isAirAttack = state.isAirAttacking && state.isJumping;
    if (isGroundAttack || isAirAttack) {
        for (const plant of plants) {
            if (plant.isDead || plant.isDying) continue;
            if (isGroundAttack && plant.lastHitStage === state.attackStage) continue;
            if (isAirAttack && plant.lastHitStage === 'air') continue;

            const distX = plant.worldX - playerWorldX;
            const absDist = Math.abs(distX);
            if (absDist < ATTACK_HITBOX_RANGE) {
                const isRight = distX > 0;
                if ((state.facingRight && isRight) || (!state.facingRight && !isRight)) {
                    plant.hp--;
                    plant.lastHitStage = isAirAttack ? 'air' : state.attackStage;
                    plant.isStunned = true;
                    plant.stunTimer = STUN_DURATION;
                    if (plant.hp <= 0) {
                        plant.isDying = true;
                        plant.deathTimer = DEATH_DURATION;
                        plant.hp = 0;
                    }
                }
            }
        }
    }

    for (let i = plants.length - 1; i >= 0; i--) {
        const plant = plants[i];

        if (plant.isDead) {
            plants.splice(i, 1);
            continue;
        }

        if (plant.isDying) {
            plant.deathTimer--;
            if (plant.deathTimer <= 0) plant.isDead = true;
            continue;
        }

        if (plant.isStunned) {
            plant.stunTimer--;
            if (plant.stunTimer <= 0) {
                plant.isStunned = false;
                plant.lastHitStage = -1;
            }
            continue;
        }

        // Salınım fazı güncelle
        plant.swayPhase += 0.05;

        // Ateş etme
        const distX = playerWorldX - plant.worldX;
        const distY = Math.abs(playerWorldY - plant.worldY);
        if (Math.abs(distX) < PLANT_DETECT_RANGE && distY < 200) {
            plant.facingRight = distX > 0;
            plant.fireTimer++;
            if (plant.fireTimer >= PLANT_FIRE_RATE) {
                plant.fireTimer = 0;
                // Mor mermi oluştur
                plantProjectiles.push({
                    worldX: plant.worldX,
                    worldY: plant.worldY,
                    vx: plant.facingRight ? PLANT_PROJECTILE_SPEED : -PLANT_PROJECTILE_SPEED,
                    life: 180 // 3 saniye ömür
                });
            }
        }
    }

    // Mermileri güncelle
    for (let i = plantProjectiles.length - 1; i >= 0; i--) {
        const proj = plantProjectiles[i];
        proj.worldX += proj.vx;
        proj.life--;

        if (proj.life <= 0) {
            plantProjectiles.splice(i, 1);
            continue;
        }

        // Saldırıyla mermi yok etme (yerde veya havada)
        const dx = proj.worldX - playerWorldX;
        const dy = proj.worldY - playerWorldY;
        const attacking = (state.isAttacking && state.attackStage > 0) || (state.isAirAttacking && state.isJumping);
        if (attacking && Math.abs(dx) < ATTACK_HITBOX_RANGE && Math.abs(dy) < 80) {
            const isRight = dx > 0;
            if ((state.facingRight && isRight) || (!state.facingRight && !isRight)) {
                plantProjectiles.splice(i, 1);
                continue;
            }
        }

        // Oyuncuyla çarpışma (saldırı dışında hasar)
        if (Math.abs(dx) < 40 && Math.abs(dy) < 60 && playerHitCooldown <= 0 && !attacking) {
            playerHP--;
            playerHitCooldown = PLAYER_HIT_COOLDOWN;
            if (playerHP < 0) playerHP = 0;
            plantProjectiles.splice(i, 1);
        }
    }
}

// Tuş Kontrolü
const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;

    if (e.key === 'ArrowUp' && !state.isAttacking) {
        if (!state.isJumping && !state.onPlatform) {
            state.isJumping = true;
            state.vy = JUMP_POWER;
            state.isRunning = false;
            state.jumpCount = 1;
        } else if (state.isJumping && state.jumpCount === 1) {
            state.jumpCount = 2;
        } else if (state.onPlatform) {
            state.isJumping = true;
            state.onPlatform = false;
            state.vy = JUMP_POWER;
            state.isRunning = false;
            state.jumpCount = 2;
            state.currentGround = PLATFORM_Y;
        }
    }

    if (e.key === 'ArrowDown' && state.onPlatform) {
        state.onPlatform = false;
        state.isJumping = true;
        state.vy = 0;
        state.currentGround = 0;
        state.jumpCount = 0;
    }

    if (e.key.toLowerCase() === 'a' && state.isJumping && !state.isAirAttacking) {
        state.isAirAttacking = true;
    }

    // Space tuşu ile dash
    if (e.key === ' ' && !state.isDashing && !state.isAttacking && dashCooldownTimer <= 0 && spaceWasReleased) {
        if (playerStamina >= DASH_STAMINA_COST) {
            state.isDashing = true;
            state.dashTimer = DASH_DURATION;
            state.dashDirection = state.facingRight ? 1 : -1;
            state.dashFrameIndex = runFrameIndex;
            state.preDashVy = state.vy;
            playerStamina -= DASH_STAMINA_COST;
            dashCooldownTimer = DASH_COOLDOWN;
            spaceWasReleased = false;
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    if (e.key === ' ') spaceWasReleased = true;
});

function update() {
    frameCount++;

    // Oyuncu hasar bağışıklık sayacı
    if (playerHitCooldown > 0) playerHitCooldown--;
    if (dashCooldownTimer > 0) dashCooldownTimer--;

    // Dash hareketi
    if (state.isDashing) {
        state.dashTimer--;
        state.x -= DASH_SPEED * state.dashDirection;

        // Rüzgar partikülleri oluştur
        const charScreenX = canvas.width / 2;
        const charScreenY = (getGroundOffset() + state.y) - cameraY + canvas.height / 2;
        for (let p = 0; p < 3; p++) {
            dashParticles.push({
                x: charScreenX + (-state.dashDirection) * (20 + Math.random() * 30),
                y: charScreenY + (Math.random() - 0.5) * 80,
                vx: (-state.dashDirection) * (2 + Math.random() * 4),
                vy: (Math.random() - 0.5) * 1.5,
                life: 16 + Math.floor(Math.random() * 10),
                maxLife: 26,
                size: 4 + Math.random() * 7
            });
        }

        if (state.dashTimer <= 0) {
            state.isDashing = false;
            // Havadaysa düşmeye devam etsin
            if (state.isJumping) {
                state.vy = state.preDashVy > 0 ? state.preDashVy : 2;
            }
        }
        const targetCameraY = getGroundOffset() + state.y;
        cameraY += (targetCameraY - cameraY) * 0.12;
        dynamicSpawn();
        updateEnemies();
        updatePlants();
        return;
    }

    // Stamina yenilenmesi
    if (playerStamina < PLAYER_MAX_STAMINA) {
        staminaRegenTimer++;
        if (staminaRegenTimer >= STAMINA_REGEN_RATE) {
            playerStamina++;
            staminaRegenTimer = 0;
        }
    } else {
        staminaRegenTimer = 0;
    }

    // Platformdayken boşluk bölgesine girerse düş
    if (state.onPlatform && !isPlatformAvailable()) {
        state.onPlatform = false;
        state.isJumping = true;
        state.vy = 0;
        state.currentGround = 0;
        state.jumpCount = 0;
    }

    if (state.isJumping) {
        if (state.vy < 0) {
            state.vy += GRAVITY;
        } else {
            state.vy += FALL_GRAVITY;
        }
        state.y += state.vy;

        if (state.jumpCount >= 2 && state.vy > 0 && state.currentGround === 0 && isPlatformAvailable()) {
            if (state.y >= PLATFORM_Y) {
                state.y = PLATFORM_Y;
                state.vy = 0;
                state.isJumping = false;
                state.isAirAttacking = false;
                state.onPlatform = true;
                state.currentGround = PLATFORM_Y;

                const targetCameraY = getGroundOffset() + state.y;
                cameraY += (targetCameraY - cameraY) * 0.12;
                dynamicSpawn();
                updateEnemies();
                updatePlants();
                return;
            }
        }

        if (state.y >= state.currentGround) {
            state.y = state.currentGround;
            state.vy = 0;
            state.isJumping = false;
            state.isAirAttacking = false;

            if (state.currentGround === PLATFORM_Y) {
                state.onPlatform = true;
            } else {
                state.onPlatform = false;
                state.jumpCount = 0;
                state.currentGround = 0;
            }
        }

        if (keys['arrowright']) {
            state.x -= SPEED;
            state.facingRight = true;
        } else if (keys['arrowleft']) {
            state.x += SPEED;
            state.facingRight = false;
        }

        const targetCameraY = getGroundOffset() + state.y;
        cameraY += (targetCameraY - cameraY) * 0.12;

        dynamicSpawn();
        updateEnemies();
        updatePlants();
        return;
    }

    // === Yerdeki / Platformdaki Mantık ===
    if (keys['a']) {
        if (!state.isAttacking && playerStamina > 0) {
            state.isAttacking = true;
            state.attackStage = 1;
            state.attackTimer = 0;
            playerStamina--;
        }

        if (state.isAttacking) {
            state.attackTimer++;

            if (state.attackTimer > ATTACK_DELAY - 5 && state.attackTimer < ATTACK_DELAY) {
                state.shakeTimer = SHAKE_INTENSITY;
            } else {
                state.shakeTimer = 0;
            }

            if (state.attackTimer >= ATTACK_DELAY) {
                state.attackTimer = 0;
                if (playerStamina > 0) {
                    state.attackStage++;
                    playerStamina--;
                    if (state.attackStage > 3) {
                        state.attackStage = 1;
                    }
                } else {
                    // Stamina bitti -> mevcut stage'de kal, yeni stage açma
                    // a tuşu bırakılınca saldırı bitecek
                }
            }

            state.isRunning = false;
        }
    } else {
        if (state.isAttacking) {
            state.isAttacking = false;
            state.attackStage = 0;
            state.attackTimer = 0;
            state.shakeTimer = 0;
        }

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

    const targetCameraY = getGroundOffset() + state.y;
    cameraY += (targetCameraY - cameraY) * 0.12;

    dynamicSpawn();
    updateEnemies();
    updatePlants();
}

function checkAttackHit() {
    // Yerdeki saldırı veya havadaki saldırı
    const isGroundAttack = state.isAttacking && state.attackStage > 0;
    const isAirAttack = state.isAirAttacking && state.isJumping;
    if (!isGroundAttack && !isAirAttack) return;

    const playerWorldX = -state.x;

    for (const enemy of enemies) {
        if (enemy.isDead || enemy.isDying) continue;

        if (isGroundAttack && enemy.lastHitStage === state.attackStage) continue;
        if (isAirAttack && enemy.lastHitStage === 'air') continue;

        const distX = enemy.worldX - playerWorldX;
        const absDist = Math.abs(distX);

        if (absDist < ATTACK_HITBOX_RANGE) {
            const enemyIsRight = distX > 0;
            if ((state.facingRight && enemyIsRight) || (!state.facingRight && !enemyIsRight)) {
                enemy.hp--;
                enemy.lastHitStage = isAirAttack ? 'air' : state.attackStage;
                enemy.isStunned = true;
                enemy.stunTimer = STUN_DURATION;
                enemy.isAttacking = false;
                enemy.attackStage = 0;
                enemy.attackTimer = 0;

                const knockDir = enemyIsRight ? 1 : -1;
                enemy.worldX += knockDir * KNOCKBACK_DIST;

                if (enemy.hp <= 0) {
                    enemy.isDying = true;
                    enemy.deathTimer = DEATH_DURATION;
                    enemy.hp = 0;
                }
            }
        }
    }
}

function updateEnemies() {
    checkAttackHit();

    const playerWorldX = -state.x;
    const playerWorldY = state.y;

    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];

        if (enemy.isDead) {
            enemies.splice(i, 1);
            continue;
        }

        if (enemy.isDying) {
            enemy.deathTimer--;
            if (enemy.deathTimer <= 0) {
                enemy.isDead = true;
            }
            continue;
        }

        if (enemy.isStunned) {
            enemy.stunTimer--;
            if (enemy.stunTimer <= 0) {
                enemy.isStunned = false;
                enemy.lastHitStage = -1;
            }
            continue;
        }

        // Saldırı bekleme sayacı
        if (enemy.attackCooldown > 0) enemy.attackCooldown--;

        // 2. kattaki düşmanlar: platform yoksa düşsün
        if (enemy.worldY === PLATFORM_Y && !enemy.isFalling) {
            if (!isPlatformAtWorldX(enemy.worldX)) {
                enemy.isFalling = true;
                enemy.vy = 0;
            }
        }

        // Düşüş fiziği
        if (enemy.isFalling) {
            enemy.vy += FALL_GRAVITY;
            enemy.worldY += enemy.vy;
            if (enemy.worldY >= 0) {
                enemy.worldY = 0;
                enemy.vy = 0;
                enemy.isFalling = false;
            }
            continue;
        }

        const distX = playerWorldX - enemy.worldX;
        const distY = Math.abs(playerWorldY - enemy.worldY);
        const absDist = Math.abs(distX);

        // Düşman saldırı durumunda
        if (enemy.isAttacking) {
            enemy.attackTimer++;

            // Attack1 -> Attack2 geçişi
            if (enemy.attackStage === 1 && enemy.attackTimer >= ZOMBIE_ATTACK_DELAY) {
                enemy.attackStage = 2;
                enemy.attackTimer = 0;

                // Attack2'de hasar kontrolü (hitbox çarpışması)
                if (!enemy.hasDealtDamage && distY < 100) {
                    const attackDistX = Math.abs(distX);
                    if (attackDistX < ZOMBIE_ATTACK_HITBOX && playerHitCooldown <= 0) {
                        playerHP--;
                        playerHitCooldown = PLAYER_HIT_COOLDOWN;
                        enemy.hasDealtDamage = true;
                        if (playerHP < 0) playerHP = 0;
                    }
                }
            }

            // Attack2 bittikten sonra idle'a dön
            if (enemy.attackStage === 2 && enemy.attackTimer >= ZOMBIE_ATTACK_DELAY) {
                enemy.isAttacking = false;
                enemy.attackStage = 0;
                enemy.attackTimer = 0;
                enemy.attackCooldown = ZOMBIE_ATTACK_COOLDOWN;
                enemy.hasDealtDamage = false;
            }
            continue; // Saldırı sırasında hareket etme
        }

        // Algılama ve kovalama
        if (absDist < ENEMY_DETECT_RANGE && distY < 200) {
            enemy.isChasing = true;
            enemy.facingRight = distX > 0;

            // Saldırı menzilindeyse ve aynı kattaysa saldır
            if (absDist < ZOMBIE_ATTACK_RANGE && distY < 100 && enemy.attackCooldown <= 0) {
                enemy.isAttacking = true;
                enemy.attackStage = 1;
                enemy.attackTimer = 0;
                enemy.hasDealtDamage = false;
                continue;
            }

            if (distX > 10) {
                enemy.worldX += ENEMY_SPEED;
            } else if (distX < -10) {
                enemy.worldX -= ENEMY_SPEED;
            }

            enemy.frameTimer++;
            if (enemy.frameTimer >= ZOMBIE_ANIM_SPEED) {
                enemy.frameIndex = (enemy.frameIndex + 1) % ZOMBIE_RUN_FRAMES;
                enemy.frameTimer = 0;
            }
        } else {
            enemy.isChasing = false;
            enemy.frameIndex = 0;
            enemy.frameTimer = 0;
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let shakeX = 0;
    let shakeY = 0;
    if (state.shakeTimer > 0) {
        shakeX = (Math.random() - 0.5) * state.shakeTimer;
        shakeY = (Math.random() - 0.5) * state.shakeTimer;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    const cameraOffsetY = -cameraY + canvas.height / 2;

    // 1. Arkaplanı Çiz
    if (assets.bg) {
        const bgH_original = assets.bg.height;
        const bgW_original = assets.bg.width;

        const scale = getScale();
        const bgH = bgH_original * scale;
        const bgW = bgW_original * scale;

        // Arka plan sabit ölçekte çizilir, canvas dışına taşan kısım kırpılır
        const bgY = cameraOffsetY - bgH / 2;

        // Arka planın orijinini ekranın ortasına hizala (karakterin olduğu yer)
        // Böylece pencere genişliği değişse de hizalama bozulmaz
        const midScreenX = canvas.width / 2;

        // state.x: dünya ofseti (sağa gidince artar, sola gidince azalır)
        // Ekranın ortasındaki dünya koordinatı: -state.x
        // Biz arka planı -state.x dünya koordinatı ekranın ortasına gelecek şekilde çizmeliyiz.
        // Yani, bg görselinin (0,0) noktası, ekranın (midScreenX + state.x, bgY) noktasında olmalı.

        if (bgW > 0) {
            let startX = (midScreenX + state.x) % bgW;
            if (startX > 0) startX -= bgW;

            // Sonsuz döngü koruması: bgW çok küçükse çizme
            if (bgW < 5) return;

            for (let i = startX; i < canvas.width; i += bgW) {
                // Sadece ekran içinde kalanları çiz (performans optimizasyonu)
                if (i + bgW > 0) {
                    ctx.drawImage(assets.bg, i, bgY, bgW, bgH);
                }
            }
        }
    }

    // 2. Düşmanları Çiz
    drawEnemies(cameraOffsetY);

    // 2.1 Plant düşmanları çiz
    drawPlants(cameraOffsetY);

    // 2.2 Plant mermilerini çiz
    drawPlantProjectiles(cameraOffsetY);

    // 2.5 Dash rüzgar partiküllerini çiz
    for (let i = dashParticles.length - 1; i >= 0; i--) {
        const p = dashParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0) {
            dashParticles.splice(i, 1);
            continue;
        }
        const alpha = p.life / p.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.fillStyle = '#ccddff';
        ctx.beginPath();
        // Yatay çizgi şeklinde rüzgar efekti
        const w = p.size * 5 * (1 - alpha * 0.3);
        const h = p.size * 0.7;
        ctx.ellipse(p.x, p.y, w, h, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 3. Karakteri Çiz
    const charScreenX = canvas.width / 2;
    const charScreenY = (getGroundOffset() + state.y) - cameraY + canvas.height / 2;

    ctx.save();

    // Hasar bağışıklığında yanıp sönme
    if (playerHitCooldown > 0) {
        ctx.globalAlpha = (Math.floor(frameCount / 4) % 2 === 0) ? 1.0 : 0.3;
    }

    ctx.translate(charScreenX, charScreenY);

    if (!state.facingRight) {
        ctx.scale(-1, 1);
    }

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
    } else if (state.isDashing) {
        currentImg = assets.run; // Dash sırasında run sprite kullan
    } else if (state.isRunning) {
        currentImg = assets.run;
    }

    if (currentImg) {
        if ((state.isRunning || state.isDashing) && !state.isAttacking && !state.isJumping) {
            const frameW = currentImg.width / RUN_FRAMES;
            const frameH = currentImg.height;
            const scaledW = frameW * CHARACTER_SCALE;
            const scaledH = frameH * CHARACTER_SCALE;
            drawX = -scaledW / 2;
            drawY = -scaledH / 2;

            // Dash sırasında frame sabit kalır
            const displayFrame = state.isDashing ? state.dashFrameIndex : runFrameIndex;

            ctx.drawImage(
                currentImg,
                displayFrame * frameW, 0, frameW, frameH,
                drawX, drawY, scaledW, scaledH
            );

            if (assets.head) {
                const pulseScale = (Math.floor(Date.now() / 380) % 2 === 0) ? 1.01 : 0.98;
                const headW = scaledW * pulseScale;
                const headH = scaledH * pulseScale;
                const headX = drawX + (scaledW - headW) / 2;
                const headY = drawY + (scaledH - headH) / 2;
                ctx.drawImage(assets.head, headX, headY, headW, headH);
            }
        } else {
            const scaledW = currentImg.width * CHARACTER_SCALE;
            const scaledH = currentImg.height * CHARACTER_SCALE;
            drawX = -scaledW / 2;
            drawY = -scaledH / 2;
            ctx.drawImage(currentImg, drawX, drawY, scaledW, scaledH);
        }
    }

    ctx.restore(); // Karakter transform

    // 4. Oyuncu Can Barı ve Stamina Barı
    drawPlayerHealthBar();
    drawPlayerStaminaBar();

    ctx.restore(); // Shake transform
}

function drawEnemies(cameraOffsetY) {
    for (const enemy of enemies) {
        if (enemy.isDead) continue;

        const enemyScreenX = enemy.worldX + state.x + canvas.width / 2;

        if (enemyScreenX < -300 || enemyScreenX > canvas.width + 300) continue;

        const enemyScreenY = (getGroundOffset() + enemy.worldY) - cameraY + canvas.height / 2 + 20;

        ctx.save();

        // Ölüm animasyonu: sarsılma + fadeout
        if (enemy.isDying) {
            const progress = 1 - (enemy.deathTimer / DEATH_DURATION);
            const alpha = 1 - progress;
            ctx.globalAlpha = alpha;
            const shakeAmt = (1 - progress) * 8;
            const sx = (Math.random() - 0.5) * shakeAmt;
            const sy = (Math.random() - 0.5) * shakeAmt;
            ctx.translate(enemyScreenX + sx, enemyScreenY + sy);
        } else if (enemy.isStunned) {
            const sx = (Math.random() - 0.5) * 6;
            const sy = (Math.random() - 0.5) * 3;
            ctx.translate(enemyScreenX + sx, enemyScreenY + sy);
        } else {
            ctx.translate(enemyScreenX, enemyScreenY);
        }

        if (!enemy.facingRight) {
            ctx.scale(-1, 1);
        }

        // Görsel seçimi
        if (enemy.isAttacking) {
            // Saldırı görselleri
            let img;
            if (enemy.attackStage === 1) {
                img = assets.zombieAttack1;
            } else {
                img = assets.zombieAttack2;
            }
            if (img) {
                const scaledW = img.width * ENEMY_SCALE;
                const scaledH = img.height * ENEMY_SCALE;
                ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
            }
        } else if ((enemy.isChasing || enemy.isStunned) && assets.zombieRun) {
            const img = assets.zombieRun;
            const frameW = img.width / ZOMBIE_RUN_FRAMES;
            const frameH = img.height;
            const scaledW = frameW * ENEMY_SCALE;
            const scaledH = frameH * ENEMY_SCALE;

            ctx.drawImage(
                img,
                enemy.frameIndex * frameW, 0, frameW, frameH,
                -scaledW / 2, -scaledH / 2, scaledW, scaledH
            );
        } else if (assets.zombieIdle) {
            const img = assets.zombieIdle;
            const scaledW = img.width * ENEMY_SCALE;
            const scaledH = img.height * ENEMY_SCALE;

            ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
        }

        ctx.restore();

        // Düşman Can Barı
        if (!enemy.isDying) {
            drawEnemyHealthBar(enemyScreenX, enemyScreenY, enemy.hp);
        }
    }
}

function drawEnemyHealthBar(screenX, screenY, hp) {
    const barWidth = 60;
    const barHeight = 8;
    const barY = screenY - 130;
    const barX = screenX - barWidth / 2;

    ctx.fillStyle = 'rgba(40, 0, 0, 0.8)';
    ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

    const hpRatio = hp / ENEMY_MAX_HP;

    let barColor = '#ff2222';

    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 1; i < ENEMY_MAX_HP; i++) {
        const lx = barX + (barWidth / ENEMY_MAX_HP) * i;
        ctx.beginPath();
        ctx.moveTo(lx, barY);
        ctx.lineTo(lx, barY + barHeight);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
}

function drawPlayerHealthBar() {
    const barWidth = 200;
    const barHeight = 16;
    const barX = canvas.width / 2 - barWidth / 2;
    const barY = 30;

    // Arka plan
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    const radius = 4;
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, radius);
    ctx.fill();

    // Can doluluk oranı
    const hpRatio = playerHP / PLAYER_MAX_HP;

    // Gradient renk
    const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth * hpRatio, barY);
    if (hpRatio > 0.5) {
        gradient.addColorStop(0, '#00cc44');
        gradient.addColorStop(1, '#00ff66');
    } else if (hpRatio > 0.25) {
        gradient.addColorStop(0, '#cc8800');
        gradient.addColorStop(1, '#ffaa00');
    } else {
        gradient.addColorStop(0, '#cc0000');
        gradient.addColorStop(1, '#ff2222');
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth * hpRatio, barHeight, radius - 1);
    ctx.fill();

    // Bölüm çizgileri (7 bölüm)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < PLAYER_MAX_HP; i++) {
        const lx = barX + (barWidth / PLAYER_MAX_HP) * i;
        ctx.beginPath();
        ctx.moveTo(lx, barY);
        ctx.lineTo(lx, barY + barHeight);
        ctx.stroke();
    }

    // Parlak kenarlık
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4, radius);
    ctx.stroke();

    // HP yazısı
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${playerHP} / ${PLAYER_MAX_HP}`, canvas.width / 2, barY + barHeight - 3);
}

function drawPlayerStaminaBar() {
    const barWidth = 160;
    const barHeight = 10;
    const barX = canvas.width / 2 - barWidth / 2;
    const barY = 54; // HP barının hemen altında
    const radius = 3;

    // Arka plan
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 1, barWidth + 4, barHeight + 2, radius);
    ctx.fill();

    // Stamina doluluk oranı
    const stRatio = playerStamina / PLAYER_MAX_STAMINA;

    // Cyan-mavi gradient
    const gradient = ctx.createLinearGradient(barX, barY, barX + barWidth * stRatio, barY);
    gradient.addColorStop(0, '#0088cc');
    gradient.addColorStop(1, '#00ccff');

    ctx.fillStyle = gradient;
    if (stRatio > 0) {
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth * stRatio, barHeight, radius - 1);
        ctx.fill();
    }

    // Bölüm çizgileri
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < PLAYER_MAX_STAMINA; i++) {
        const lx = barX + (barWidth / PLAYER_MAX_STAMINA) * i;
        ctx.beginPath();
        ctx.moveTo(lx, barY);
        ctx.lineTo(lx, barY + barHeight);
        ctx.stroke();
    }

    // Kenarlık
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 1, barWidth + 4, barHeight + 2, radius);
    ctx.stroke();
}

function drawPlants(cameraOffsetY) {
    for (const plant of plants) {
        if (plant.isDead) continue;

        const screenX = plant.worldX + state.x + canvas.width / 2;
        if (screenX < -300 || screenX > canvas.width + 300) continue;

        const screenY = (getGroundOffset() + plant.worldY) - cameraY + canvas.height / 2 + 20;

        ctx.save();

        if (plant.isDying) {
            const progress = 1 - (plant.deathTimer / DEATH_DURATION);
            ctx.globalAlpha = 1 - progress;
            const sx = (Math.random() - 0.5) * (1 - progress) * 8;
            const sy = (Math.random() - 0.5) * (1 - progress) * 8;
            ctx.translate(screenX + sx, screenY + sy);
        } else if (plant.isStunned) {
            const sx = (Math.random() - 0.5) * 6;
            ctx.translate(screenX + sx, screenY);
        } else {
            // Salınım hareketi
            const sway = Math.sin(plant.swayPhase) * 3;
            ctx.translate(screenX + sway, screenY);
        }

        if (!plant.facingRight) {
            ctx.scale(-1, 1);
        }

        if (assets.plant) {
            const img = assets.plant;
            const scaledW = img.width * PLANT_SCALE;
            const scaledH = img.height * PLANT_SCALE;
            ctx.drawImage(img, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
        }

        ctx.restore();

        // Can barı
        if (!plant.isDying) {
            const barWidth = 40;
            const barHeight = 6;
            const barY2 = screenY - 80;
            const barX2 = screenX - barWidth / 2;

            ctx.fillStyle = 'rgba(40, 0, 0, 0.8)';
            ctx.fillRect(barX2 - 1, barY2 - 1, barWidth + 2, barHeight + 2);

            const hpRatio = plant.hp / PLANT_HP;
            ctx.fillStyle = '#ff2222';
            ctx.fillRect(barX2, barY2, barWidth * hpRatio, barHeight);

            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1;
            const lx = barX2 + barWidth / 2;
            ctx.beginPath();
            ctx.moveTo(lx, barY2);
            ctx.lineTo(lx, barY2 + barHeight);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.strokeRect(barX2 - 1, barY2 - 1, barWidth + 2, barHeight + 2);
        }
    }
}

function drawPlantProjectiles(cameraOffsetY) {
    for (const proj of plantProjectiles) {
        const screenX = proj.worldX + state.x + canvas.width / 2;
        const screenY = (getGroundOffset() + proj.worldY) - cameraY + canvas.height / 2 + 20;

        if (screenX < -50 || screenX > canvas.width + 50) continue;

        ctx.save();
        // Mor parlayan mermi
        const glow = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, PLANT_PROJECTILE_SIZE * 2);
        glow.addColorStop(0, 'rgba(180, 0, 255, 0.8)');
        glow.addColorStop(0.5, 'rgba(120, 0, 200, 0.4)');
        glow.addColorStop(1, 'rgba(80, 0, 160, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(screenX, screenY, PLANT_PROJECTILE_SIZE * 2, 0, Math.PI * 2);
        ctx.fill();

        // İç çekirdek
        ctx.fillStyle = '#cc44ff';
        ctx.beginPath();
        ctx.arc(screenX, screenY, PLANT_PROJECTILE_SIZE * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

let lastTime = 0;
const FIXED_STEP = 1000 / 60; // 60 FPS saniye başına güncelleme (yaklaşık 16.67ms)
let accumulator = 0;

function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    // Delta time'ı sınırla (max 100ms) - Eğer tab inaktif kalırsa veya lag olursa oyun kilitlenmesin
    accumulator += Math.min(deltaTime, 100);

    // Eğer frame drop olursa birden fazla update çalıştırıp yakala
    // Sonsuz döngü koruması için while yerine max adım sınırı da koyabiliriz ama genelde gerekmez
    while (accumulator >= FIXED_STEP) {
        update();
        accumulator -= FIXED_STEP;
    }

    draw();
    requestAnimationFrame(loop);
}

loadImages(() => {
    spawnEnemies();
    requestAnimationFrame(loop);
});
