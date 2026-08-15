// MOONSHOT — entry point. Owns the WebGPU renderer and the VAB <-> flight
// mode switch.

import * as THREE from 'three/webgpu';
import { VAB } from './vab.js';
import { Flight } from './flight.js';
import { HUD } from './hud.js';
import { getLang, setLang, onLangChange, applyStaticI18n, t, otherLangLabel } from './i18n.js';
import {
  buildSave, validateSave, snapshotFromState, QUICKSAVE_NAME,
  listBrowserSaves, writeBrowserSave, readBrowserSave,
} from './save.js';
import { VERSION } from './version.js';

const app = document.getElementById('app');

applyStaticI18n();
document.title = t('title');

function paintVersion() {
  for (const el of document.querySelectorAll('[data-game-version]')) {
    el.textContent = `v${VERSION}`;
  }
}
paintVersion();

function syncLangButtons() {
  const label = otherLangLabel();
  const a = document.getElementById('btn-lang');
  const b = document.getElementById('btn-lang-flight');
  if (a) a.textContent = label;
  if (b) b.textContent = label;
}

function toggleLang() {
  setLang(getLang() === 'en' ? 'zh' : 'en');
}

syncLangButtons();

async function boot() {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  app.prepend(renderer.domElement);
  try {
    await renderer.init();
  } catch (err) {
    console.warn('WebGPU init failed, continuing with fallback', err);
  }

  // ---- VAB preview scene ----
  const vabScene = new THREE.Scene();
  vabScene.background = new THREE.Color(0x0a0f1a);
  const vabCam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 500);
  vabScene.add(new THREE.AmbientLight(0xaaccff, 0.7));
  const key = new THREE.DirectionalLight(0xfff0dd, 2.2);
  key.position.set(4, 6, 5);
  vabScene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.8);
  rim.position.set(-5, 2, -4);
  vabScene.add(rim);
  // floor grid
  const grid = new THREE.GridHelper(60, 30, 0x2c4569, 0x16243a);
  vabScene.add(grid);

  let mode = 'vab';
  let vabFocusH = 8;
  let vabAngle = 0.6;
  let vabDrag = false;

  const flight = new Flight({
    renderer,
    onRevert: () => {
      mode = 'vab';
      vab.show();
    },
  });
  await flight.init();

  const vab = new VAB({
    scene: vabScene,
    camera: vabCam,
    frame: (h) => { vabFocusH = Math.max(6, h); },
    onLaunch: (design) => {
      vab.hide();
      mode = 'flight';
      flight.sound.ensure(); // user gesture: unlock audio
      flight.start(design);
    },
  });
  vab.show();

  const $ = (id) => document.getElementById(id);
  const CRAFT_KEY = 'moonshot-crafts';

  function collectCrafts() {
    try {
      const data = JSON.parse(localStorage.getItem(CRAFT_KEY) ?? '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch { return {}; }
  }

  function restoreCrafts(crafts) {
    if (!crafts || typeof crafts !== 'object' || Array.isArray(crafts)) return;
    try {
      const all = collectCrafts();
      Object.assign(all, crafts);
      localStorage.setItem(CRAFT_KEY, JSON.stringify(all));
    } catch { /* private mode */ }
  }

  function refreshSaveSelects() {
    const names = listBrowserSaves();
    for (const id of ['save-select', 'flight-save-select']) {
      const sel = $(id);
      if (!sel) continue;
      const prev = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      for (const name of names) {
        const o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        sel.appendChild(o);
      }
      if (names.includes(prev)) sel.value = prev;
    }
  }

  function saveFeedback(msg) {
    if (mode === 'flight' && flight.active) HUD.msg(msg);
    else {
      const info = $('part-info');
      if (info) info.textContent = msg;
    }
  }

  function captureGameSave(name) {
    const workshop = {
      name: vab.design.name,
      stack: [...vab.design.stack],
      radials: structuredClone(vab.design.radials),
      selected: vab.selected,
    };
    let flightBlock = null;
    let saveMode = mode;
    if (mode === 'flight' && flight.active && flight.st) {
      saveMode = 'flight';
      const design = structuredClone(flight.design);
      flightBlock = {
        craftName: design?.name ?? '',
        design: {
          name: design?.name ?? '',
          stack: [...(design?.stack ?? [])],
          radials: structuredClone(design?.radials ?? []),
        },
        snapshot: snapshotFromState(flight.st, { tag: name, craft: design?.name }),
        stageIdx: flight.stageIndex,
        warpIdx: flight.warpIdx,
        sas: !!flight.st.sas,
        sasMode: flight.st.sasMode ?? 'hold',
        controls: { ...(flight.st.controls ?? { pitch: 0, yaw: 0, roll: 0 }) },
        mapOpen: !!flight.mapOpen,
        cam: { ...flight.camCtl },
        liftedOff: !!flight.flags?.liftoff,
      };
    }
    const vessels = (mode === 'flight' && flight.active && flight.vessels)
      ? flight.vessels.map((v) => ({
        id: v.id,
        name: v.name,
        design: {
          name: v.design?.name ?? v.name ?? '',
          stack: [...(v.design?.stack ?? [])],
          radials: structuredClone(v.design?.radials ?? []),
        },
        snapshot: snapshotFromState(v.st, { tag: name, craft: v.name }),
        stageIdx: v.stageIdx ?? 0,
        liftedOff: !!v.liftedOff,
      }))
      : null;
    return buildSave({
      name,
      mode: saveMode,
      lang: getLang(),
      workshop,
      crafts: collectCrafts(),
      flight: flightBlock,
      vessels,
      activeId: flight.activeId ?? null,
      targetId: flight.targetId ?? null,
      weld: flight.weld ?? null,
      dockState: flight.dockState ?? 'free',
    });
  }

  function applyGameSave(doc) {
    validateSave(doc);
    restoreCrafts(doc.crafts);
    vab.applyWorkshop(doc.workshop);
    vab.refreshLoadList();
    if (doc.lang === 'en' || doc.lang === 'zh') setLang(doc.lang);

    if (doc.mode === 'flight' && doc.flight?.design) {
      vab.hide();
      mode = 'flight';
      flight.sound.ensure();
      flight.start(structuredClone(doc.flight.design));
      if (doc.flight.snapshot) flight.applySnapshot(doc.flight.snapshot);
      flight.applyGameExtras(doc.flight);
      if (Array.isArray(doc.vessels)) {
        for (const rec of doc.vessels) {
          if (!rec?.design || rec.id === (doc.activeId || 'active')) continue;
          const v = flight.spawnOrbital(rec.design, {
            name: rec.name, id: rec.id, body: rec.snapshot?.body || 'kerbin',
            ap_m: 80_000, pe_m: 80_000, ta_deg: 0,
          });
          const s = rec.snapshot;
          if (s?.pos && v?.st) {
            v.st.pos.set(s.pos[0], s.pos[1], s.pos[2]);
            v.st.vel.set(s.vel[0], s.vel[1], s.vel[2]);
            if (s.quat) v.st.quat.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
            v.st.body = s.body || v.st.body;
            v.st.t = s.t ?? v.st.t;
            v.st.landed = !!s.landed;
          }
        }
        flight.targetId = doc.targetId ?? null;
        flight.dockState = doc.dockState ?? 'free';
        flight.refreshHUD?.();
      }
    } else if (mode === 'flight') {
      flight.stop();
      mode = 'vab';
      vab.show();
    }
    refreshSaveSelects();
    return doc;
  }

  function saveGame(name) {
    const n = String(name ?? '').trim();
    if (!n) {
      saveFeedback(t('save.needName'));
      return null;
    }
    const doc = captureGameSave(n);
    writeBrowserSave(n, doc);
    refreshSaveSelects();
    saveFeedback(t('save.saved', { name: n }));
    return doc;
  }

  function loadGame(name) {
    const n = String(name ?? '').trim();
    if (!n) {
      saveFeedback(t('save.none'));
      return null;
    }
    const doc = readBrowserSave(n);
    applyGameSave(doc);
    saveFeedback(t('save.loaded', { name: n }));
    return doc;
  }

  function typedSaveName() {
    return ($('save-name')?.value || '').trim();
  }

  function selectedSaveName() {
    return ($('flight-save-select')?.value || $('save-select')?.value || '').trim();
  }

  $('btn-game-save').onclick = () => saveGame(typedSaveName());
  $('save-select').onchange = (e) => { if (e.target.value) loadGame(e.target.value); };
  $('btn-flight-save').onclick = () => saveGame(typedSaveName() || QUICKSAVE_NAME);
  $('flight-save-select').onchange = (e) => { if (e.target.value) loadGame(e.target.value); };
  refreshSaveSelects();

  function enterFlight(design) {
    vab.hide();
    mode = 'flight';
    flight.sound.ensure();
    flight.start(design);
    return true;
  }
  window.__moonshot = { flight, vab, setLang, getLang, saveGame, loadGame, version: VERSION, enterFlight };

  document.getElementById('btn-lang').onclick = toggleLang;
  document.getElementById('btn-lang-flight').onclick = toggleLang;
  onLangChange(() => {
    applyStaticI18n();
    document.title = t('title');
    syncLangButtons();
    vab.refresh();
    if (flight.active) flight.refreshHUD();
  });

  addEventListener('keydown', (e) => {
    const typing = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA';
    if (e.code === 'KeyL') {
      if (typing) return;
      if (mode === 'flight' && flight.active) return; // RCS right
      toggleLang();
      return;
    }
    if (e.code === 'F5') {
      e.preventDefault();
      if (typing && e.target.id === 'save-name') return;
      saveGame(QUICKSAVE_NAME);
      return;
    }
    if (e.code === 'F9') {
      e.preventDefault();
      if (typing && e.target.id === 'save-name') return;
      loadGame(selectedSaveName() || QUICKSAVE_NAME);
    }
  });

  // VAB camera drag
  addEventListener('pointerdown', (e) => {
    if (mode === 'vab' && e.target === renderer.domElement) vabDrag = true;
  });
  addEventListener('pointerup', () => { vabDrag = false; });
  addEventListener('pointermove', (e) => {
    if (mode === 'vab' && vabDrag) vabAngle += e.movementX * 0.006;
  });

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    vabCam.aspect = innerWidth / innerHeight;
    vabCam.updateProjectionMatrix();
    flight.resize(innerWidth, innerHeight);
  });

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    if (mode === 'vab') {
      const r = Math.max(10, vabFocusH * 1.7);
      vabCam.position.set(
        Math.cos(vabAngle) * r,
        vabFocusH * 0.55,
        Math.sin(vabAngle) * r,
      );
      vabCam.lookAt(0, vabFocusH * 0.45, 0);
      renderer.setClearColor(0x0a0f1a);
      renderer.render(vabScene, vabCam);
    } else {
      flight.frame(dt);
    }
  });
}

boot().catch((err) => {
  console.error(err);
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;color:#ff8d7e;font-family:monospace;padding:40px;text-align:center;';
  const h2 = document.createElement('h2');
  h2.textContent = t('boot.failed');
  const p1 = document.createElement('p');
  p1.textContent = String(err?.message || err);
  const p2 = document.createElement('p');
  p2.style.color = '#7e93b0';
  p2.textContent = t('boot.webgpu');
  const inner = document.createElement('div');
  inner.append(h2, p1, p2);
  div.appendChild(inner);
  document.body.appendChild(div);
});
