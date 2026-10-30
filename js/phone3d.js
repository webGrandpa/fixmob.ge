// ================================
// Fixmob — procedural 3D phone
// Hero idle pose → scroll-driven exploded "anatomy" → reassembled "repaired".
// ================================
import * as THREE from './vendor/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const root = document.documentElement;
const canvas = document.getElementById('phone-canvas');
const stage = document.querySelector('.stage');
const hero = document.querySelector('.hero');
const anatomy = document.querySelector('.anatomy');

function fail(err) {
    if (err) console.warn('[phone3d]', err);
    root.classList.remove('webgl');
    window.dispatchEvent(new Event('phone:ready'));
}

if (!canvas || !stage || !window.gsap || !window.ScrollTrigger) {
    fail('missing dependencies');
} else {
    try {
        init();
    } catch (err) {
        fail(err);
    }
}

function init() {
    const { gsap, ScrollTrigger } = window;

    // ---------- Renderer / scene ----------
    const isTouch = matchMedia('(pointer: coarse)').matches;
    const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.75 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0, 5.4);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 3, 4);
    const rimCyan = new THREE.DirectionalLight(0x00d2ff, 5);
    rimCyan.position.set(-4, 2, -3);
    const rimBlue = new THREE.DirectionalLight(0x3a7bd5, 6);
    rimBlue.position.set(4, -2.5, -2);
    scene.add(key, rimCyan, rimBlue);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // ---------- Dimensions ----------
    const W = 0.76;
    const H = 1.58;
    const R = 0.115;

    // ---------- Helpers ----------
    function roundedRectShape(w, h, r) {
        const s = new THREE.Shape();
        const x = -w / 2;
        const y = -h / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + w - r, y);
        s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r);
        s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h);
        s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r);
        s.quadraticCurveTo(x, y, x + r, y);
        return s;
    }

    function roundedRectPath(w, h, r, cx = 0, cy = 0) {
        const p = new THREE.Path();
        const x = cx - w / 2;
        const y = cy - h / 2;
        p.moveTo(x + r, y);
        p.lineTo(x + w - r, y);
        p.quadraticCurveTo(x + w, y, x + w, y + r);
        p.lineTo(x + w, y + h - r);
        p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        p.lineTo(x + r, y + h);
        p.quadraticCurveTo(x, y + h, x, y + h - r);
        p.lineTo(x, y + r);
        p.quadraticCurveTo(x, y, x + r, y);
        return p;
    }

    // Thin rounded slab. RoundedBoxGeometry clamps its radius to half the depth,
    // which squares off thin parts — extruding a rounded outline keeps corners round.
    function slab(w, h, d, r) {
        const b = Math.min(d * 0.35, 0.004);
        const geo = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * b, h - 2 * b, Math.max(r - b, 0.001)), {
            depth: d - 2 * b,
            bevelEnabled: true,
            bevelThickness: b,
            bevelSize: b,
            bevelSegments: 3,
            curveSegments: 18,
        });
        geo.translate(0, 0, -(d - 2 * b) / 2);
        return geo;
    }

    // Flat shape with 0..1 UVs so canvas textures map edge to edge.
    function texturedPlane(w, h, r, material) {
        const geo = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 24);
        const pos = geo.attributes.position;
        const uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
            uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
        }
        return new THREE.Mesh(geo, material);
    }

    function outline(w, h, r, z = 0) {
        const pts = roundedRectShape(w, h, r).getPoints(16).map((p) => new THREE.Vector3(p.x, p.y, z));
        const mat = new THREE.LineBasicMaterial({
            color: 0x00d2ff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
    }

    function canvasTexture(width, height, draw) {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');
        draw(ctx, width, height);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        tex.userData.redraw = (fn) => {
            ctx.clearRect(0, 0, width, height);
            fn(ctx, width, height);
            tex.needsUpdate = true;
        };
        return tex;
    }

    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // Deterministic pseudo-random so the board looks the same on every load.
    let seed = 20090101;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };

    // ---------- Textures ----------
    function drawScreen(ctx, w, h, fixed) {
        const bg = ctx.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#01030a');
        bg.addColorStop(0.55, '#030c22');
        bg.addColorStop(1, '#072356');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        // Flowing ribbons (echo of the brand gradient)
        const ribbons = [
            ['#00d2ff', 0.55, -0.1],
            ['#3a7bd5', 0.75, 0.15],
            ['#6aa8ff', 0.35, 0.35],
        ];
        ctx.globalCompositeOperation = 'lighter';
        ribbons.forEach(([color, alpha, off]) => {
            const g = ctx.createLinearGradient(0, h * 0.2, w, h * 0.9);
            g.addColorStop(0, 'rgba(0,0,0,0)');
            g.addColorStop(0.5, color);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = alpha * 0.8;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(-w * 0.2, h * (0.55 + off));
            ctx.bezierCurveTo(w * 0.3, h * (0.2 + off), w * 0.6, h * (0.95 + off), w * 1.2, h * (0.35 + off));
            ctx.lineTo(w * 1.2, h * (0.45 + off));
            ctx.bezierCurveTo(w * 0.6, h * (1.05 + off), w * 0.3, h * (0.32 + off), -w * 0.2, h * (0.68 + off));
            ctx.closePath();
            ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        const glow = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, w * 0.9);
        glow.addColorStop(0, fixed ? 'rgba(0,210,255,0.35)' : 'rgba(0,210,255,0.12)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        // Status bar + dynamic island
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = '600 30px Manrope, system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('9:41', 54, 62);
        rr(ctx, w - 118, 50, 52, 24, 7);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.stroke();
        rr(ctx, w - 113, 55, 36, 14, 4);
        ctx.fill();
        ctx.fillStyle = '#000';
        rr(ctx, w / 2 - 92, 36, 184, 52, 26);
        ctx.fill();

        ctx.textAlign = 'center';
        if (fixed) {
            const cx = w / 2;
            const cy = h * 0.42;
            const ring = ctx.createLinearGradient(cx - 120, cy - 120, cx + 120, cy + 120);
            ring.addColorStop(0, '#3a7bd5');
            ring.addColorStop(1, '#00d2ff');
            ctx.shadowColor = '#00d2ff';
            ctx.shadowBlur = 60;
            ctx.lineWidth = 14;
            ctx.strokeStyle = ring;
            ctx.beginPath();
            ctx.arc(cx, cy, 120, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 18;
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(cx - 52, cy + 2);
            ctx.lineTo(cx - 14, cy + 40);
            ctx.lineTo(cx + 58, cy - 40);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 64px Oswald, Manrope, sans-serif';
            ctx.fillText('100%', cx, cy + 230);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.font = '600 26px Manrope, sans-serif';
            ctx.fillText('FIXMOB · OK', cx, cy + 290);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = '600 200px Oswald, Manrope, sans-serif';
            ctx.fillText('09:41', w / 2, h * 0.26);
            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.font = '600 30px Manrope, sans-serif';
            ctx.fillText('FIXMOB.GE', w / 2, h * 0.155);
        }

        // Home indicator
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        rr(ctx, w / 2 - 110, h - 44, 220, 10, 5);
        ctx.fill();
    }

    const screenTex = canvasTexture(640, 1330, (c, w, h) => drawScreen(c, w, h, false));

    const pcbTex = canvasTexture(900, 760, (ctx, w, h) => {
        const bg = ctx.createLinearGradient(0, 0, w, h);
        bg.addColorStop(0, '#0d1418');
        bg.addColorStop(1, '#070a0d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        // Traces
        for (let i = 0; i < 140; i++) {
            let x = rand() * w;
            let y = rand() * h;
            ctx.beginPath();
            ctx.moveTo(x, y);
            for (let s = 0; s < 4; s++) {
                if (rand() > 0.5) x += (rand() - 0.5) * 220;
                else y += (rand() - 0.5) * 220;
                ctx.lineTo(x, y);
            }
            ctx.strokeStyle = rand() > 0.82 ? 'rgba(212,160,74,0.75)' : 'rgba(74,140,170,0.32)';
            ctx.lineWidth = rand() > 0.7 ? 3 : 1.5;
            ctx.stroke();
        }
        // Vias
        for (let i = 0; i < 260; i++) {
            ctx.beginPath();
            ctx.arc(rand() * w, rand() * h, 2 + rand() * 3, 0, Math.PI * 2);
            ctx.fillStyle = rand() > 0.5 ? 'rgba(214,170,90,0.85)' : 'rgba(160,190,205,0.5)';
            ctx.fill();
        }
        // Silkscreen labels
        ctx.fillStyle = 'rgba(230,240,245,0.55)';
        ctx.font = '600 20px monospace';
        ['U1201', 'C4410', 'R220', 'L3300', 'J5100', 'U2700', 'FL01'].forEach((t) => {
            ctx.fillText(t, rand() * (w - 80), 30 + rand() * (h - 40));
        });
        ctx.strokeStyle = 'rgba(214,170,90,0.9)';
        ctx.lineWidth = 6;
        rr(ctx, 6, 6, w - 12, h - 12, 26);
        ctx.stroke();
    });

    function drawBattery(ctx, w, h) {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#15181d');
        g.addColorStop(0.5, '#0b0d10');
        g.addColorStop(1, '#1a1e24');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.textAlign = 'center';
        ctx.font = '700 52px Oswald, Manrope, sans-serif';
        ctx.fillText('FIXMOB', w / 2, h * 0.3);
        ctx.font = '600 28px Manrope, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('Li-ion Polymer Battery', w / 2, h * 0.39);
        ctx.fillText('3.87V  ⎓  4500 mAh  ·  17.4 Wh', w / 2, h * 0.45);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.12, h * 0.56, w * 0.76, h * 0.22);
        ctx.font = '500 20px Manrope, sans-serif';
        ['Do not puncture or disassemble', 'Keep away from heat and fire', 'Designed for repair · Batumi'].forEach((t, i) => {
            ctx.fillText(t, w / 2, h * 0.61 + i * 34);
        });
        // Charge level bar
        const bar = ctx.createLinearGradient(w * 0.2, 0, w * 0.8, 0);
        bar.addColorStop(0, '#3a7bd5');
        bar.addColorStop(1, '#00d2ff');
        ctx.fillStyle = bar;
        rr(ctx, w * 0.2, h * 0.86, w * 0.6, 14, 7);
        ctx.fill();
    }

    const batteryTex = canvasTexture(620, 760, drawBattery);

    // ---------- Materials ----------
    const mat = {
        glass: new THREE.MeshPhysicalMaterial({
            color: 0xcfe8ff,
            metalness: 0,
            roughness: 0.03,
            transparent: true,
            opacity: 0.1,
            clearcoat: 1,
            clearcoatRoughness: 0.02,
            iridescence: 0.5,
            iridescenceIOR: 1.3,
            envMapIntensity: 1.6,
            depthWrite: false,
        }),
        black: new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.45, metalness: 0.3 }),
        screen: new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }),
        titanium: new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 1, roughness: 0.24 }),
        titaniumDark: new THREE.MeshStandardMaterial({ color: 0x3b424c, metalness: 0.9, roughness: 0.45 }),
        pcbEdge: new THREE.MeshStandardMaterial({ color: 0x0a0f12, roughness: 0.6, metalness: 0.1 }),
        pcb: new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.55, metalness: 0.2 }),
        chip: new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.32, metalness: 0.5 }),
        shield: new THREE.MeshStandardMaterial({ color: 0xd9dee4, metalness: 1, roughness: 0.18 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xd4a04a, metalness: 1, roughness: 0.25 }),
        battery: new THREE.MeshStandardMaterial({ map: batteryTex, roughness: 0.38, metalness: 0.15 }),
        batteryBody: new THREE.MeshStandardMaterial({ color: 0x0d1013, roughness: 0.4, metalness: 0.3 }),
        back: new THREE.MeshPhysicalMaterial({
            color: 0x1d3150,
            metalness: 0.35,
            roughness: 0.32,
            clearcoat: 1,
            clearcoatRoughness: 0.12,
        }),
        lens: new THREE.MeshPhysicalMaterial({
            color: 0x050a14,
            metalness: 0.2,
            roughness: 0.05,
            clearcoat: 1,
            iridescence: 1,
            iridescenceIOR: 1.6,
        }),
    };

    // ---------- Layers ----------
    const phone = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.add(phone);
    scene.add(tilt);

    const layers = [];
    function addLayer(name, group, z, zExploded, outlineDims) {
        group.userData = { z, zExploded, lift: 0 };
        group.position.z = z;
        if (outlineDims) {
            const o = outline(...outlineDims);
            group.add(o);
            group.userData.outline = o;
        }
        phone.add(group);
        layers.push(group);
        layers[name] = group;
        return group;
    }

    // 0 — Cover glass
    {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(slab(W, H, 0.012, R), mat.glass));
        addLayer('glass', g, 0.046, 1.05, [W + 0.01, H + 0.01, R, 0.008]);
    }

    // 1 — OLED display
    {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(slab(W - 0.02, H - 0.02, 0.012, R - 0.01), mat.black));
        const screen = texturedPlane(W - 0.05, H - 0.05, R * 0.75, mat.screen);
        screen.position.z = 0.0065;
        g.add(screen);
        // Flex cable
        const flex = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.004), mat.gold);
        flex.position.set(0.12, -H / 2 + 0.2, -0.008);
        g.add(flex);
        addLayer('display', g, 0.034, 0.66, [W - 0.01, H - 0.01, R * 0.9, 0.008]);
    }

    // 2 — Titanium frame + midplate
    {
        const g = new THREE.Group();
        const ring = roundedRectShape(W, H, R);
        ring.holes.push(roundedRectPath(W - 0.045, H - 0.045, R - 0.022));
        const frameGeo = new THREE.ExtrudeGeometry(ring, {
            depth: 0.062,
            bevelEnabled: true,
            bevelSize: 0.006,
            bevelThickness: 0.008,
            bevelSegments: 4,
            curveSegments: 20,
        });
        frameGeo.translate(0, 0, -0.031);
        g.add(new THREE.Mesh(frameGeo, mat.titanium));

        const plate = roundedRectShape(W - 0.05, H - 0.05, R - 0.025);
        plate.holes.push(roundedRectPath(0.3, 0.3, 0.06, -W * 0.18, H * 0.33));
        plate.holes.push(roundedRectPath(0.34, 0.12, 0.03, W * 0.05, -H * 0.04));
        plate.holes.push(roundedRectPath(0.12, 0.06, 0.02, 0, -H * 0.43));
        const plateGeo = new THREE.ExtrudeGeometry(plate, { depth: 0.006, bevelEnabled: false, curveSegments: 16 });
        const plateMesh = new THREE.Mesh(plateGeo, mat.titaniumDark);
        plateMesh.position.z = 0.012;
        g.add(plateMesh);

        // Side buttons
        const btnGeo = new RoundedBoxGeometry(0.018, 0.16, 0.03, 2, 0.008);
        [
            [W / 2 + 0.008, H * 0.17, 0.16],
            [-W / 2 - 0.008, H * 0.24, 0.1],
            [-W / 2 - 0.008, H * 0.1, 0.1],
        ].forEach(([x, y, len]) => {
            const b = new THREE.Mesh(btnGeo, mat.titanium);
            b.scale.y = len / 0.16;
            b.position.set(x, y, 0);
            g.add(b);
        });
        addLayer('frame', g, 0, 0.22, [W + 0.02, H + 0.02, R + 0.01, 0.04]);
    }

    // 3 — Logic board + camera module
    const chipAnchor = new THREE.Vector3();
    {
        const g = new THREE.Group();
        const bw = W * 0.84;
        const bh = H * 0.42;
        const by = H * 0.24;
        const board = new THREE.Mesh(slab(bw, bh, 0.01, 0.03), mat.pcbEdge);
        board.position.y = by;
        g.add(board);
        const top = texturedPlane(bw - 0.006, bh - 0.006, 0.028, mat.pcb);
        top.position.set(0, by, 0.0056);
        g.add(top);

        const parts = [
            // [w, h, d, x, y, material]
            [0.17, 0.17, 0.018, 0.1, by - 0.02, mat.chip],
            [0.2, 0.12, 0.016, 0.1, by + 0.15, mat.shield],
            [0.12, 0.16, 0.016, -0.19, by - 0.12, mat.shield],
            [0.09, 0.07, 0.012, 0.22, by - 0.15, mat.chip],
            [0.08, 0.05, 0.01, -0.02, by - 0.17, mat.chip],
            [0.06, 0.03, 0.01, 0.26, by + 0.04, mat.gold],
            [0.06, 0.03, 0.01, 0.26, by - 0.01, mat.gold],
        ];
        parts.forEach(([w, h, d, x, y, m]) => {
            const p = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.004), m);
            p.position.set(x, y, 0.005 + d / 2);
            g.add(p);
        });
        chipAnchor.set(0.1, by - 0.02, 0.03);

        // Camera module: three lenses
        const barrel = new THREE.CylinderGeometry(0.052, 0.056, 0.05, 40);
        barrel.rotateX(Math.PI / 2);
        const glassDisc = new THREE.CylinderGeometry(0.036, 0.036, 0.004, 40);
        glassDisc.rotateX(Math.PI / 2);
        [
            [-0.21, by + 0.15],
            [-0.21, by + 0.02],
            [-0.09, by + 0.085],
        ].forEach(([x, y]) => {
            const b = new THREE.Mesh(barrel, mat.titaniumDark);
            b.position.set(x, y, -0.02);
            const l = new THREE.Mesh(glassDisc, mat.lens);
            l.position.set(x, y, -0.046);
            g.add(b, l);
        });

        // Lower sub-board with USB-C
        const sub = new THREE.Mesh(slab(W * 0.5, H * 0.08, 0.01, 0.02), mat.pcbEdge);
        sub.position.set(0, -H * 0.44, 0);
        g.add(sub);
        const usb = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.035, 0.03, 2, 0.012), mat.shield);
        usb.position.set(0, -H * 0.47, 0.01);
        g.add(usb);

        const o = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(
                roundedRectShape(bw + 0.02, bh + 0.02, 0.035)
                    .getPoints(8)
                    .map((p) => new THREE.Vector3(p.x, p.y + by, 0.01))
            ),
            new THREE.LineBasicMaterial({
                color: 0x00d2ff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        g.add(o);
        addLayer('board', g, -0.004, -0.2, null);
        g.userData.outline = o;
    }

    // 4 — Battery
    {
        const g = new THREE.Group();
        const bw = W * 0.74;
        const bh = H * 0.46;
        const by = -H * 0.17;
        const body = new THREE.Mesh(slab(bw, bh, 0.03, 0.03), mat.batteryBody);
        body.position.y = by;
        g.add(body);
        const label = texturedPlane(bw - 0.02, bh - 0.02, 0.016, mat.battery);
        label.position.set(0, by, 0.0155);
        g.add(label);
        const tab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.006), mat.gold);
        tab.position.set(bw * 0.25, by + bh / 2 + 0.02, 0.005);
        g.add(tab);
        const o = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(
                roundedRectShape(bw + 0.02, bh + 0.02, 0.03)
                    .getPoints(8)
                    .map((p) => new THREE.Vector3(p.x, p.y + by, 0.02))
            ),
            new THREE.LineBasicMaterial({
                color: 0x00d2ff,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        g.add(o);
        addLayer('battery', g, -0.006, -0.58, null);
        g.userData.outline = o;
    }

    // 5 — Back glass + camera plateau
    {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(slab(W, H, 0.014, R), mat.back));
        const plateau = new THREE.Mesh(slab(0.34, 0.36, 0.022, 0.08), mat.back);
        plateau.position.set(-W * 0.17, H * 0.34, -0.014);
        g.add(plateau);
        const ringGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.02, 40);
        ringGeo.rotateX(Math.PI / 2);
        const lensGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.006, 40);
        lensGeo.rotateX(Math.PI / 2);
        [
            [-W * 0.17 - 0.075, H * 0.34 + 0.085],
            [-W * 0.17 - 0.075, H * 0.34 - 0.085],
            [-W * 0.17 + 0.08, H * 0.34],
        ].forEach(([x, y]) => {
            const r = new THREE.Mesh(ringGeo, mat.titanium);
            r.position.set(x, y, -0.032);
            const l = new THREE.Mesh(lensGeo, mat.lens);
            l.position.set(x, y, -0.042);
            g.add(r, l);
        });
        addLayer('back', g, -0.044, -1.0, [W + 0.01, H + 0.01, R, -0.008]);
    }

    // ---------- Hotspots (HTML, projected) ----------
    // Step order matches .anatomy__step elements: screen, board, battery, frame/liquid.
    // `turn` is the part that swings round to face the viewer while its step is active.
    const steps = [
        { turn: layers.display, layers: [layers.glass, layers.display], anchor: [layers.display, new THREE.Vector3(W * 0.26, H * 0.2, 0.01)] },
        { turn: layers.board, layers: [layers.board], anchor: [layers.board, chipAnchor] },
        { turn: layers.battery, layers: [layers.battery], anchor: [layers.battery, new THREE.Vector3(-W * 0.12, -H * 0.1, 0.02)] },
        { turn: layers.frame, layers: [layers.frame], anchor: [layers.frame, new THREE.Vector3(W / 2, -H * 0.3, 0.03)] },
    ];
    const hotspots = [...document.querySelectorAll('.hotspot')];
    const stepEls = [...document.querySelectorAll('.anatomy__step')];
    const progressEls = [...document.querySelectorAll('.anatomy__tick')];
    const doneEl = document.querySelector('.anatomy__done');
    const hintEl = document.querySelector('.anatomy__hint');
    const stageSticky = document.querySelector('.stage__sticky');
    const headerEl = document.getElementById('header');
    const eyebrowEl = hero?.querySelector('.hero__eyebrow');

    // ---------- State ----------
    const target = { heroP: 0, anatomyP: 0, mx: 0, my: 0 };
    const cur = {
        x: 0, y: 0, s: 1, rx: 0, ry: 0, rz: 0,
        explode: 0, mx: 0, my: 0, fixed: 0, labels: 0,
    };
    let activeStep = -1;
    let wasGlued = false;
    let screenFixed = false;
    let first = true;

    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    const smooth = (v, a, b) => {
        const t = clamp01((v - a) / (b - a));
        return t * t * (3 - 2 * t);
    };
    const lerp = (a, b, t) => a + (b - a) * t;

    let portrait = false;
    function poses() {
        return portrait
            ? {
                hero: { x: 0, y: 0.64, s: 0.6, rx: 0.1, ry: -0.5, rz: 0.04 },
                anat: { x: 0, y: 0.14, s: 0.62, rx: 0.32, ry: -1.02, rz: 0.06 },
                done: { x: 0, y: 0.24, s: 0.68, rx: 0.06, ry: -0.3, rz: 0 },
            }
            : {
                hero: { x: 1.05, y: -0.02, s: 1, rx: 0.12, ry: -0.5, rz: 0.06 },
                anat: { x: 0.62, y: 0, s: 0.9, rx: 0.3, ry: -1.0, rz: 0.05 },
                done: { x: 0.62, y: 0.05, s: 0.98, rx: 0.06, ry: -0.32, rz: 0 },
            };
    }

    function resize() {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        portrait = camera.aspect < 0.85;
        camera.fov = portrait ? 38 : 30;
        camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    if (!isTouch) {
        window.addEventListener('mousemove', (e) => {
            target.mx = (e.clientX / window.innerWidth) * 2 - 1;
            target.my = (e.clientY / window.innerHeight) * 2 - 1;
        }, { passive: true });
    }

    ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        onUpdate: (self) => { target.heroP = self.progress; },
    });
    ScrollTrigger.create({
        trigger: anatomy,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => { target.anatomyP = self.progress; },
    });

    let visible = true;
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(stage);

    const v = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const qIdentity = new THREE.Quaternion();
    const qFacing = new THREE.Quaternion();
    const clock = new THREE.Clock();

    function setActiveStep(i) {
        if (i === activeStep) return;
        activeStep = i;
        stepEls.forEach((el, idx) => el.classList.toggle('is-active', idx === i));
        progressEls.forEach((el, idx) => el.classList.toggle('is-active', idx <= i));
        hotspots.forEach((el, idx) => el.classList.toggle('is-active', idx === i));
    }

    function frame() {
        if (!visible || document.hidden) return;
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        const k = first ? 1 : 1 - Math.pow(0.0008, dt); // frame-rate independent damping
        first = false;

        const P = poses();
        const hp = smooth(target.heroP, 0, 1);
        const ap = target.anatomyP;
        const toAnat = smooth(ap, 0, 0.16);
        const explode = smooth(ap, 0.03, 0.2) * (1 - smooth(ap, 0.8, 0.93));
        const done = smooth(ap, 0.8, 0.95);

        // Portrait: the hero phone is glued to its slot between the header and
        // the eyebrow, so it scrolls with the copy instead of sitting under it.
        // It then fades back in for the anatomy.
        const glued = portrait && ap <= 0;
        if (portrait && eyebrowEl) {
            const ch = canvas.clientHeight;
            const unitsPerPx = (2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / ch;
            const top = (headerEl ? headerEl.offsetHeight + 16 : 80) - window.scrollY;
            const bottom = eyebrowEl.getBoundingClientRect().top - 14;
            P.hero.y = (ch / 2 - (top + bottom) / 2) * unitsPerPx;
            P.hero.s = Math.min(0.8, Math.max(0.3, ((bottom - top) * unitsPerPx * 0.9) / H));
            if (stageSticky) stageSticky.style.opacity = ap > 0 ? smooth(ap, 0, 0.05).toFixed(3) : '1';
        } else if (stageSticky && stageSticky.style.opacity) {
            stageSticky.style.opacity = '';
        }

        // Pose blend: hero → (mid) → anatomy → done
        const mid = portrait ? { ...(glued ? P.hero : P.anat) } : {
            x: lerp(P.hero.x, P.anat.x, hp),
            y: lerp(P.hero.y, 0, hp),
            s: lerp(P.hero.s, P.anat.s * 1.05, hp),
            rx: lerp(P.hero.rx, 0.15, hp),
            ry: lerp(P.hero.ry, -0.75, hp),
            rz: P.hero.rz,
        };
        const tgt = {};
        for (const key of ['x', 'y', 's', 'rx', 'ry', 'rz']) {
            tgt[key] = lerp(lerp(mid[key], P.anat[key], toAnat), P.done[key], done);
        }

        cur.x = lerp(cur.x, tgt.x, k);
        cur.y = lerp(cur.y, tgt.y, k);
        cur.s = lerp(cur.s, tgt.s, k);
        cur.rx = lerp(cur.rx, tgt.rx, k);
        cur.ry = lerp(cur.ry, tgt.ry, k);
        cur.rz = lerp(cur.rz, tgt.rz, k);
        cur.explode = lerp(cur.explode, explode, k);
        if (glued) {
            cur.y = tgt.y;
            cur.s = tgt.s;
        } else if (wasGlued) {
            // Leaving the hero: rise into the anatomy from just below its spot.
            cur.y = tgt.y - 0.5;
            cur.s = tgt.s * 0.85;
        }
        wasGlued = glued;
        cur.mx = lerp(cur.mx, target.mx, k * 0.6);
        cur.my = lerp(cur.my, target.my, k * 0.6);

        // Idle sway fades out as the anatomy takes over
        const idle = 1 - toAnat;
        tilt.position.set(cur.x, cur.y + Math.sin(t * 1.1) * 0.035 * idle, 0);
        tilt.scale.setScalar(cur.s);
        tilt.rotation.set(
            cur.rx + cur.my * 0.12,
            cur.ry + cur.mx * 0.22 + Math.sin(t * 0.45) * 0.12 * idle,
            cur.rz
        );

        // Steps
        const stepP = (ap - 0.22) / 0.145;
        const step = ap > 0.2 && ap < 0.8 ? Math.min(3, Math.max(0, Math.floor(stepP))) : -1;
        setActiveStep(step);

        // The active part counter-rotates against the whole phone so it faces the
        // camera, and slides toward the viewer so it clears its neighbours.
        qFacing.copy(tilt.quaternion).invert();
        const pull = (portrait ? 0.7 : 0.95) / cur.s;
        layers.forEach((layer) => {
            const u = layer.userData;
            const isActive = step >= 0 && steps[step].layers.includes(layer);
            const isTurning = step >= 0 && steps[step].turn === layer;
            u.lift = lerp(u.lift, isActive ? 1 : 0, k);
            u.turn = lerp(u.turn || 0, isTurning ? 1 : 0, k * 0.8);
            const e = u.turn * u.turn * (3 - 2 * u.turn);
            forward.set(0, 0, pull * e).applyQuaternion(qFacing);
            layer.position.set(forward.x, forward.y, lerp(u.z, u.zExploded, cur.explode) + forward.z);
            layer.quaternion.slerpQuaternions(qIdentity, qFacing, e);
            if (u.outline) {
                u.outline.material.opacity = cur.explode * (0.15 + u.lift * 0.85);
            }
        });

        // Screen brightens and switches to the "repaired" state
        const wantFixed = ap > 0.86;
        if (wantFixed !== screenFixed) {
            screenFixed = wantFixed;
            screenTex.userData.redraw((c, w, h) => drawScreen(c, w, h, screenFixed));
        }
        mat.screen.color.setScalar(1 + done * 0.25);

        // UI state
        const labels = smooth(ap, 0.18, 0.22) * (1 - smooth(ap, 0.78, 0.82));
        root.style.setProperty('--anatomy-labels', labels.toFixed(3));
        if (doneEl) doneEl.classList.toggle('is-visible', ap > 0.88);
        if (hintEl) hintEl.classList.toggle('is-hidden', ap > 0.12);

        renderer.render(scene, camera);

        // Project hotspots after render (matrices are fresh)
        if (labels > 0.01) {
            const cw = canvas.clientWidth;
            const ch = canvas.clientHeight;
            steps.forEach((s, i) => {
                const el = hotspots[i];
                if (!el) return;
                const [obj, local] = s.anchor;
                v.copy(local).applyMatrix4(obj.matrixWorld).project(camera);
                el.style.transform = `translate3d(${((v.x + 1) / 2) * cw}px, ${((1 - v.y) / 2) * ch}px, 0)`;
            });
        }
    }

    gsap.ticker.add(frame);

    // Fonts are used inside canvas textures — redraw once they're ready.
    document.fonts?.ready.then(() => {
        screenTex.userData.redraw((c, w, h) => drawScreen(c, w, h, screenFixed));
        batteryTex.userData.redraw(drawBattery);
    });

    // Compile shaders before revealing so the first scroll doesn't hitch.
    renderer.compile(scene, camera);
    frame();
    root.classList.add('webgl-ready');
    window.dispatchEvent(new Event('phone:ready'));
}
