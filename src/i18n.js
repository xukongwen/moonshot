// UI language: English / 中文. Persist in localStorage, interpolate {vars}.

export const LANGS = ['en', 'zh'];
const KEY = 'moonshot.lang';

const listeners = new Set();

export const STRINGS = {
  en: {
    title: 'MOONSHOT — a tiny space program',
    'boot.failed': 'Failed to start',
    'boot.webgpu': 'MOONSHOT needs WebGPU (Chrome/Edge 113+, Safari 26+) or WebGL2 fallback.',

    'vab.assembly': 'VEHICLE ASSEMBLY',
    'vab.save': 'Save',
    'vab.load': 'Load craft…',
    'vab.clear': 'Clear',
    'vab.stockHopper': 'Stock: Suborbital Hopper',
    'vab.stockMun': 'Stock: Mun Express',
    'vab.stockDuna': 'Stock: Duna Hauler',
    'vab.launch': 'LAUNCH ▶',
    'vab.untitled': 'Untitled Craft',
    'vab.stack': 'STACK',
    'vab.stackDir': '(top → bottom)',
    'vab.radial': 'RADIAL ATTACH',
    'vab.add': 'Add',
    'vab.staging': 'STAGING & Δv',
    'vab.vacuum': '(vacuum)',
    'vab.hoverHint': 'Hover a part for stats. Click to add to the stack (inserted below the selected part).',
    'vab.radialHint': 'Attaches to the selected stack part. Boosters & drop tanks get radial decouplers automatically.',
    'vab.emptyStack': 'Empty. Add a pod from the palette — the stack builds top-down.',
    'vab.saved': 'Saved “{name}”.',
    'vab.noPod': 'No command pod! Add one or the rocket has no one to fly it.',
    'vab.noEngine': 'No engines. Gravity wins by default.',
    'vab.selectStack': 'Select a stack part first.',
    'vab.radialOnly': '{name} is radial-attach: select a stack part and use Radial Attach.',
    'vab.noEnginesStaged': 'No engines staged yet.',
    'vab.stageN': 'Stage {n}',
    'vab.burn': 'burn {s} s · {mass} t wet',
    'vab.partsLine': 'Parts {n} · Height {h} m · Mass',
    'vab.totalDv': 'Total Δv (vac):',
    'vab.munHint': 'Mun round trip needs roughly 5,800–7,000 m/s and pad TWR > 1.2',
    'vab.fuelKg': '{n} kg fuel',

    'save.game': 'Save game',
    'save.load': 'Load game…',
    'save.quick': 'Quicksave',
    'save.saved': 'Saved “{name}”.',
    'save.loaded': 'Loaded “{name}”.',
    'save.none': 'No save selected.',
    'save.needName': 'Name the save first.',
    'flight.help.f5': 'quicksave',
    'flight.help.f9': 'load save',

    'cat.Pods': 'Pods',
    'cat.Tanks': 'Tanks',
    'cat.Engines': 'Engines',
    'cat.Coupling': 'Coupling',
    'cat.Aero': 'Aero',
    'cat.Utility': 'Utility',

    'part.mass': 'mass',
    'part.fuel': 'fuel',
    'part.maxT': 'maxT',
    'part.thrust': 'thrust',
    'part.vac': 'vac',

    'flight.map': 'Map [M]',
    'flight.keys': 'Keys [F1]',
    'flight.revert': 'Revert to VAB',
    'flight.relaunch': 'Relaunch same craft',
    'flight.helpTitle': 'FLIGHT CONTROLS',
    'flight.close': 'Close',
    'flight.helpRails': 'Rails warp (>4×) needs engines off and to be out of the atmosphere.',
    'flight.help.throttle': 'throttle up / down',
    'flight.help.fullcut': 'full throttle / cut',
    'flight.help.stage': 'activate next stage',
    'flight.help.pitch': 'pitch',
    'flight.help.yaw': 'yaw',
    'flight.help.roll': 'roll',
    'flight.help.sas': 'toggle SAS',
    'flight.help.sasmode': 'SAS: hold / prograde / retrograde',
    'flight.help.legs': 'toggle landing legs',
    'flight.help.chutes': 'arm / deploy parachutes',
    'flight.help.warp': 'time warp down / up',
    'flight.help.map': 'map view',
    'flight.help.camera': 'camera',
    'flight.help.lang': 'toggle language',

    'hud.alt': 'ALT',
    'hud.agl': 'AGL',
    'hud.vspd': 'VSPD',
    'hud.acc': 'ACC',
    'hud.orb': 'ORB',
    'hud.srf': 'SRF',
    'hud.mass': 'MASS',
    'hud.ec': 'EC',
    'hud.tempOk': 'TEMP OK',
    'hud.tempHigh': 'TEMP HIGH',
    'hud.tempCrit': 'TEMP CRITICAL',
    'hud.warp': 'WARP',
    'hud.rails': 'rails',
    'hud.stages': 'STAGES',
    'hud.orbit': 'ORBIT',
    'hud.thr': 'THR',
    'hud.orbVel': 'orbital velocity',
    'hud.srfVel': 'surface velocity',
    'hud.snapshot': 'Snapshot {tag} @ T+{t}s',
    'hud.target': 'TGT',
    'hud.range': 'RANGE',
    'hud.closing': 'CLOSING',
    'hud.dock': 'DOCK',
    'hud.dockFree': 'FREE',
    'hud.dockSoft': 'SOFT',
    'hud.dockHard': 'HARD',
    'flight.help.rcs': 'RCS translate (I/K fwd, J/L left, H/N up)',
    'flight.help.helpkey': 'this help',
    'flight.help.agent': 'toggle agent panel',
    'flight.help.switchVessel': 'switch vessel',
    'agent.title': 'AGENT',
    'agent.toggle': 'Agent [O]',
    'agent.goal': 'GOAL',
    'agent.plan': 'PLAN',
    'agent.thought': 'THOUGHT',
    'agent.node': 'NODE',
    'agent.planBtn': 'Plan',
    'agent.stepBtn': 'Step',
    'agent.revertBtn': 'Revert',
    'agent.checkBtn': 'Check',
    'agent.goalHint': 'Mun or Duna and back',

    'orb.ap': 'Apoapsis',
    'orb.pe': 'Periapsis',
    'orb.tAp': 'Time to Ap',
    'orb.tPe': 'Time to Pe',
    'orb.ecc': 'Eccentricity',
    'orb.period': 'Period',
    'orb.inc': 'Inclination',
    'orb.munPhase': 'Mun phase ∠',
    'orb.burnAt': '(burn at {deg}°)',
    'orb.dunaWindow': 'Duna window',
    'orb.hohmann': '(Hohmann {deg}°)',
    'orb.dunaPhase': 'Duna phase ∠',
    'orb.encounter': '— {name} ENCOUNTER —',
    'orb.soiEntry': 'SOI entry in',
    'orb.periapsis': 'periapsis',
    'orb.munPe': 'Mun periapsis',
    'orb.bodyPe': '{name} periapsis',
    'map.ap': 'Ap',
    'map.pe': 'Pe',
    'map.munPe': 'Mun Pe',
    'map.bodyPe': '{name} Pe',

    'sit.prelaunch': 'PRELAUNCH — {body}',
    'sit.flying': 'FLYING — {body}',
    'sit.orbiting': 'ORBITING — {body}',
    'sit.suborbital': 'SUB-ORBITAL — {body}',
    'sit.escaping': 'ESCAPING — {body}',
    'sit.landed': 'LANDED — {body}',
    'sit.destroyed': 'DESTROYED — {body}',

    'stage.decouple': 'decouple',
    'stage.dropBoosters': 'drop boosters',
    'stage.parachutes': 'parachutes',
    'stage.ignition': 'Ignition',
    'stage.decoupleIgnite': 'Decouple + ignite',
    'stage.dropBoostersTitle': 'Drop boosters',
    'stage.parachutesTitle': 'Parachutes',

    'sas.hold': 'HOLD',
    'sas.prograde': 'PRO ▲',
    'sas.retrograde': 'RETRO ▼',

    'body.kerbol': 'Kerbol',
    'body.kerbin': 'Kerbin',
    'body.mun': 'Mun',
    'body.minmus': 'Minmus',
    'body.duna': 'Duna',

    'msg.pad': '{name} on the pad. SPACE to ignite. H for controls.',
    'msg.switchVessel': 'Controlling {name}',
    'msg.legsDeployed': 'Landing legs deployed',
    'msg.legsStowed': 'Landing legs stowed',
    'msg.chutesArmed': 'Parachutes armed',
    'msg.warpThrottle': 'Dropped out of warp: throttle input',
    'msg.warpAtmo': 'Rails warp needs engines off and clear of the atmosphere',
    'msg.noStages': 'No more stages',
    'msg.sepIgnition': 'Stage separation — ignition!',
    'msg.ignition': 'Ignition!',
    'msg.atmoWarp': 'Atmosphere ahead — dropping out of warp',
    'banner.liftoff': 'LIFTOFF!',
    'msg.liftoff': 'Liftoff!',
    'banner.munLand': '🌕 YOU LANDED ON THE MUN!',
    'msg.touchdownFlag': 'Touchdown at {speed} m/s. Flag-planting optional.',
    'msg.splashdownSpeed': 'Splashdown at {speed} m/s',
    'msg.touchdownSpeed': 'Touchdown at {speed} m/s',
    'msg.landedSpeed': 'Landed at {speed} m/s',
    'banner.roundtrip': '🏆 MUN ROUND TRIP COMPLETE',
    'end.complete': 'MISSION COMPLETE',
    'end.completeText': '{verb} on Kerbin after a successful Mun landing.<br>The space program is very proud.',
    'end.recovery': 'SAFE RECOVERY',
    'end.recoveryText': '{verb} on {where}. Crew recovered.',
    'verb.splashdown': 'Splashdown',
    'verb.touchdown': 'Touchdown',
    'end.crash': 'RAPID UNSCHEDULED DISASSEMBLY',
    'end.crashClose': 'So close — landing legs and less speed next time.',
    'end.crashCrater': 'The crater is impressive, at least.',
    'end.crashText': 'Impact at {speed} m/s on {body}.<br>{hint}',
    'msg.overheat': '{name} destroyed by overheating!',
    'end.burned': 'BURNED UP ON REENTRY',
    'end.burnedText': 'The pod overheated. Try a shallower reentry (periapsis 30–45 km), keep the heat shield pointed retrograde.',
    'msg.chuteDeploy': 'Parachute deployed!',
    'msg.chuteTorn': 'Parachute torn off — too fast!',
    'banner.munSoi': 'ENTERING MUN SPHERE OF INFLUENCE',
    'msg.kerbinSpace': 'Back in Kerbin space',
    'banner.soi': 'ENTERED {name} SOI',
    'banner.space': 'SPACE REACHED — 70 km',
    'banner.orbit': 'STABLE ORBIT ACHIEVED',
  },
  zh: {
    title: 'MOONSHOT — 小小航天计划',
    'boot.failed': '启动失败',
    'boot.webgpu': 'MOONSHOT 需要 WebGPU（Chrome/Edge 113+、Safari 26+）或 WebGL2 回退。',

    'vab.assembly': '飞船装配',
    'vab.save': '保存',
    'vab.load': '读取飞船…',
    'vab.clear': '清空',
    'vab.stockHopper': '库存：亚轨道试验器',
    'vab.stockMun': '库存：缪恩快车',
    'vab.stockDuna': '库存：Duna 搬运船',
    'vab.launch': '发射 ▶',
    'vab.untitled': '未命名飞船',
    'vab.stack': '堆叠',
    'vab.stackDir': '(上→下)',
    'vab.radial': '径向安装',
    'vab.add': '添加',
    'vab.staging': '分级与Δv',
    'vab.vacuum': '(真空)',
    'vab.hoverHint': '悬停零件查看数据。点击加入堆叠（插入到选中零件下方）。',
    'vab.radialHint': '安装到选中的堆叠零件。助推器与副油箱会自动带径向分离器。',
    'vab.emptyStack': '空的。从零件库添加指令舱 — 堆叠从上往下搭建。',
    'vab.saved': '已保存“{name}”。',
    'vab.noPod': '没有指令舱！加上一个，否则没人开这艘火箭。',
    'vab.noEngine': '没有发动机。默认重力获胜。',
    'vab.selectStack': '请先选中一个堆叠零件。',
    'vab.radialOnly': '{name} 只能径向安装：选中堆叠零件后使用径向安装。',
    'vab.noEnginesStaged': '尚未分级发动机。',
    'vab.stageN': '第{n}级',
    'vab.burn': '燃烧 {s} s · {mass} t 湿重',
    'vab.partsLine': '零件 {n} · 高度 {h} m · 质量',
    'vab.totalDv': '总Δv（真空）：',
    'vab.munHint': '缪恩往返大约需要 5,800–7,000 m/s，发射台推重比 > 1.2',
    'vab.fuelKg': '{n} kg 燃料',

    'save.game': '存档',
    'save.load': '读档',
    'save.quick': '快速存档',
    'save.saved': '已存档“{name}”。',
    'save.loaded': '已读档“{name}”。',
    'save.none': '没有选中的存档。',
    'save.needName': '请先填写存档名。',
    'flight.help.f5': '快速存档',
    'flight.help.f9': '读取存档',

    'cat.Pods': '指令舱',
    'cat.Tanks': '燃料箱',
    'cat.Engines': '发动机',
    'cat.Coupling': '分离',
    'cat.Aero': '气动',
    'cat.Utility': '实用',

    'part.mass': '质量',
    'part.fuel': '燃料',
    'part.maxT': '最高温',
    'part.thrust': '推力',
    'part.vac': '真空',

    'flight.map': '地图 [M]',
    'flight.keys': '按键 [F1]',
    'flight.revert': '返回装配',
    'flight.relaunch': '用同一飞船再飞',
    'flight.helpTitle': '飞行操作',
    'flight.close': '关闭',
    'flight.helpRails': '轨道推演（>4×）需要发动机关闭且离开大气层。',
    'flight.help.throttle': '油门增减',
    'flight.help.fullcut': '满油门 / 熄火',
    'flight.help.stage': '激活下一级',
    'flight.help.pitch': '俯仰',
    'flight.help.yaw': '偏航',
    'flight.help.roll': '滚转',
    'flight.help.sas': '开关 SAS',
    'flight.help.sasmode': 'SAS：保持 / 顺行 / 逆行',
    'flight.help.legs': '收放着陆架',
    'flight.help.chutes': '预开 / 打开降落伞',
    'flight.help.warp': '时间加速减 / 增',
    'flight.help.map': '地图视角',
    'flight.help.camera': '相机',
    'flight.help.lang': '切换语言',

    'hud.alt': '高度',
    'hud.agl': '离地',
    'hud.vspd': '垂速',
    'hud.acc': '过载',
    'hud.orb': '轨道',
    'hud.srf': '地面',
    'hud.mass': '质量',
    'hud.ec': '电',
    'hud.tempOk': '温度正常',
    'hud.tempHigh': '温度偏高',
    'hud.tempCrit': '温度危险',
    'hud.warp': '时间加速',
    'hud.rails': '轨道推演',
    'hud.stages': '分级',
    'hud.orbit': '轨道',
    'hud.thr': '油门',
    'hud.orbVel': '轨道速度',
    'hud.srfVel': '地面速度',
    'hud.snapshot': '快照 {tag} @ T+{t}s',
    'hud.target': '目标',
    'hud.range': '距离',
    'hud.closing': '接近',
    'hud.dock': '对接',
    'hud.dockFree': '分离',
    'hud.dockSoft': '软对接',
    'hud.dockHard': '硬对接',
    'flight.help.rcs': 'RCS 平移（I/K 前后，J/L 左右，H/N 上下）',
    'flight.help.helpkey': '本帮助',
    'flight.help.agent': '开关智能体面板',
    'flight.help.switchVessel': '切换飞船',
    'agent.title': '智能体',
    'agent.toggle': '智能体 [O]',
    'agent.goal': '目标',
    'agent.plan': '计划',
    'agent.thought': '思考',
    'agent.node': '结点',
    'agent.planBtn': '规划',
    'agent.stepBtn': '走一步',
    'agent.revertBtn': '回退',
    'agent.checkBtn': '检查',
    'agent.goalHint': '去月球或火星再回来',

    'orb.ap': '远拱点',
    'orb.pe': '近拱点',
    'orb.tAp': '至远拱',
    'orb.tPe': '至近拱',
    'orb.ecc': '偏心率',
    'orb.period': '周期',
    'orb.inc': '倾角',
    'orb.munPhase': '缪恩相位 ∠',
    'orb.burnAt': '（在 {deg}° 点火）',
    'orb.dunaWindow': '火星窗口',
    'orb.hohmann': '（霍曼 {deg}°）',
    'orb.dunaPhase': '火星相位 ∠',
    'orb.encounter': '— {name} 交会 —',
    'orb.soiEntry': '进入SOI',
    'orb.periapsis': '近拱点',
    'orb.munPe': '缪恩近拱点',
    'orb.bodyPe': '{name}近拱点',
    'map.ap': '远拱',
    'map.pe': '近拱',
    'map.munPe': '缪恩近拱',
    'map.bodyPe': '{name}近拱',

    'sit.prelaunch': '发射前 — {body}',
    'sit.flying': '飞行 — {body}',
    'sit.orbiting': '轨道飞行 — {body}',
    'sit.suborbital': '亚轨道 — {body}',
    'sit.escaping': '逃逸 — {body}',
    'sit.landed': '已着陆 — {body}',
    'sit.destroyed': '已摧毁 — {body}',

    'stage.decouple': '分离',
    'stage.dropBoosters': '抛助推',
    'stage.parachutes': '降落伞',
    'stage.ignition': '点火',
    'stage.decoupleIgnite': '分离 + 点火',
    'stage.dropBoostersTitle': '抛助推',
    'stage.parachutesTitle': '降落伞',

    'sas.hold': '保持',
    'sas.prograde': '顺行 ▲',
    'sas.retrograde': '逆行 ▼',

    'body.kerbol': '科博尔',
    'body.kerbin': '科比因',
    'body.mun': '缪恩',
    'body.minmus': '敏姆斯',
    'body.duna': '火星',

    'msg.pad': '{name} 已在发射台。空格点火。H 查看操作。',
    'msg.switchVessel': '控制 {name}',
    'msg.legsDeployed': '着陆架已展开',
    'msg.legsStowed': '着陆架已收起',
    'msg.chutesArmed': '降落伞已预开',
    'msg.warpThrottle': '退出时间加速：油门输入',
    'msg.warpAtmo': '轨道推演需要发动机关闭且离开大气层',
    'msg.noStages': '没有更多分级',
    'msg.sepIgnition': '级间分离 — 点火！',
    'msg.ignition': '点火！',
    'msg.atmoWarp': '前方大气层 — 退出时间加速',
    'banner.liftoff': '起飞！',
    'msg.liftoff': '起飞！',
    'banner.munLand': '🌕 你登上了缪恩！',
    'msg.touchdownFlag': '着陆 {speed} m/s。插旗可选。',
    'msg.splashdownSpeed': '溅落 {speed} m/s',
    'msg.touchdownSpeed': '着陆 {speed} m/s',
    'msg.landedSpeed': '着陆 {speed} m/s',
    'banner.roundtrip': '🏆 缪恩往返完成',
    'end.complete': '任务完成',
    'end.completeText': '成功登陆缪恩后{verb}科比因。<br>航天计划深感自豪。',
    'end.recovery': '安全回收',
    'end.recoveryText': '在{where}{verb}。乘员已回收。',
    'verb.splashdown': '溅落',
    'verb.touchdown': '着陆',
    'end.crash': '计划外快速拆解',
    'end.crashClose': '就差一点 — 下次放下着陆架并降低速度。',
    'end.crashCrater': '至少坑很壮观。',
    'end.crashText': '以 {speed} m/s 撞击{body}。<br>{hint}',
    'msg.overheat': '{name} 过热损毁！',
    'end.burned': '再入烧毁',
    'end.burnedText': '指令舱过热。尝试更浅的再入（近拱点 30–45 km），热盾朝逆行。',
    'msg.chuteDeploy': '降落伞打开！',
    'msg.chuteTorn': '降落伞被撕掉 — 太快了！',
    'banner.munSoi': '进入缪恩影响球',
    'msg.kerbinSpace': '回到科比因空间',
    'banner.soi': '进入{name}影响球',
    'banner.space': '到达太空 — 70 km',
    'banner.orbit': '进入稳定轨道',
  },
};

let current = null;

function readStored() {
  try {
    const v = localStorage.getItem(KEY);
    if (LANGS.includes(v)) return v;
  } catch { /* private mode / node */ }
  return 'en';
}

export function getLang() {
  if (current && LANGS.includes(current)) return current;
  current = readStored();
  return current;
}

export function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function t(key, vars) {
  const lang = getLang();
  let s = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  if (vars) {
    s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  }
  return s;
}

export function bodyName(id) {
  const key = `body.${id}`;
  const s = t(key);
  return s === key ? String(id) : s;
}

export function applyStaticI18n() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const text = t(el.dataset.i18nPlaceholder);
    if (el.tagName === 'SELECT') {
      const opt = el.querySelector('option[value=""], option:first-child');
      if (opt && !opt.value) opt.textContent = text;
    } else {
      el.placeholder = text;
    }
  });
}

export function otherLangLabel() {
  return getLang() === 'en' ? '中文' : 'EN';
}

export function stageLabel(en) {
  const map = {
    'Decouple + ignite': 'stage.decoupleIgnite',
    Ignition: 'stage.ignition',
    'Drop boosters': 'stage.dropBoostersTitle',
    Parachutes: 'stage.parachutesTitle',
  };
  return map[en] ? t(map[en]) : en;
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = getLang();
}
