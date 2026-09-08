import { hydrateIcons, icon } from './icons.js';

export function readStored(key, fallback) {
  try { const value = localStorage.getItem(`seal-bay:${key}`); return value === null ? fallback : JSON.parse(value); } catch { return fallback; }
}
export function storeValue(key, value) {
  try { localStorage.setItem(`seal-bay:${key}`, JSON.stringify(value)); } catch { /* Play remains available when browser storage is disabled. */ }
}
export const formatTime = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;

export function createUI(callbacks) {
  hydrateIcons();
  const $ = id => document.getElementById(id);
  const modal = $('modal');
  let mode = 'relax';
  let manifest = [];
  let seen = new Set(readStored('seen', []));
  let noticeTimeout;
  let modalKind = '';
  function open(content, kind = '') {
    modalKind = kind;
    $('modal-content').innerHTML = content;
    hydrateIcons(modal);
    if (!modal.open) { callbacks.onModal(true); modal.showModal(); }
  }
  function close() { modal.close(); }
  modal.addEventListener('close', () => { const kind = modalKind; modalKind = ''; callbacks.onModal(false, kind); });
  modal.addEventListener('click', event => {
    const rect = modal.getBoundingClientRect();
    if (event.target === modal && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
  });
  $('modal-close').addEventListener('click', close);
  $('start-button').addEventListener('click', () => callbacks.onStart(mode));
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  }));
  $('sound-button').addEventListener('click', callbacks.onSound);
  $('pause-button').addEventListener('click', pause);
  $('home-link').addEventListener('click', event => { event.preventDefault(); if (document.body.classList.contains('playing')) pause(); });
  function pause() {
    open(`<div class="eyebrow">TAKE A LITTLE BREATH</div><h2>海风，也歇一会儿。</h2><p>时间停在这里，小家伙们会等你回来。</p><button class="primary-button" id="resume-button">继续投喂 ${icon('play')}</button><button class="secondary-button" id="restart-button">重新开始这一局</button><button class="secondary-button" id="back-home-button">回到海湾首页</button>`, 'pause');
    $('resume-button').onclick = close;
    $('restart-button').onclick = () => { close(); callbacks.onStart(mode); };
    $('back-home-button').onclick = () => { close(); callbacks.onHome(); };
  }
  $('help-button').addEventListener('click', () => open(`<div class="eyebrow">A SMALL GUIDE TO HAPPINESS</div><h2>一划，交个朋友。</h2><div class="help-steps"><div class="help-step"><span>01</span><div><strong>看见冒头的小家伙了吗？</strong><p>海豹会在不同的位置探出头。挑一只，从画面下半部开始向上划。</p></div></div><div class="help-step"><span>02</span><div><strong>方向对准它，速度决定远近。</strong><p>向左上或右上划可以调整方向。近处轻轻划，远处快快划；松手，小鱼就飞出去。虚线和圆圈会提示落点。</p></div></div><div class="help-step"><span>03</span><div><strong>听，它在催饭呢。</strong><p>等得久了会发出真实的海豹叫声，再等下去就会气鼓鼓地潜走。喂到嘴边，它会开心得拍小鳍。</p></div></div><div class="help-step"><span>04</span><div><strong>沙滩上的朋友，也想被摸摸。</strong><p>看到头顶的工具提示，把右侧的软毛刷或摸摸手套拖到那只海豹身上，松手就会轻轻抚摸。它会眯起眼睛，送你小爱心。海豹也会自己游上岸、爬下水：开局十几秒就能看到第一次，之后会隔久一些再换地方。</p></div></div></div><p>电脑也能玩：按住鼠标左键，从下往上划。空格或 Esc 暂停，M 切换声音。</p>`, 'help'));
  function guide() {
    open(`<div class="eyebrow">MEET THE BAY RESIDENTS · ${seen.size} / 8</div><h2>八张脸，八种可爱。</h2><p>有刚认识世界的小幼崽，也有慢悠悠的老朋友。成功投喂，就会留下你们的相遇记录。</p><div class="guide-grid">${manifest.map(seal => `<article class="guide-card"><img src="${seal.portrait}" alt="${seal.species}${seal.age} ${seal.name}"/><span class="met">${seen.has(seal.id) ? '已交朋友' : '等你投喂'}</span><h3>${seal.name}</h3><p>${seal.species} · ${seal.age}</p><p>${seal.description}</p></article>`).join('')}</div>`, 'guide');
  }
  $('guide-button').addEventListener('click', guide);
  $('credits-button').addEventListener('click', () => open(`<div class="eyebrow">MADE WITH A LITTLE CARE</div><h2>关于这片小海湾。</h2><p>一个关于等待、分享和圆滚滚朋友的小游戏。海豹拥有独立的脸型、年龄与斑纹，用真实海豹的身体特征，做了一点可爱的想象。</p><ul class="credits-list"><li>三维海豹：Blender 原创模型，8 种外观。</li><li>海湾与交互：Three.js、Web Audio。</li><li>海豹叫声：烟台东炮台海豹湾斑海豹现场原声，视频第 15–17 秒。</li><li>录音来源：海豹大叔直播，Bilibili「白糖蘸年糕」转载视频。不同海豹外观共享这段原声。</li></ul><p>这是想象中的共同海湾。现实中，这些海豹分布在不同海域；白衣幼崽也并不以游泳捕鱼为日常。</p><a class="credits-link" href="https://www.bilibili.com/video/BV1cV411X7GW/?t=15" target="_blank" rel="noopener noreferrer">查看烟台海豹叫声原视频 ↗</a>`, 'credits'));
  return {
    pause,
    get modalOpen() { return modal.open; },
    setModels(data) {
      manifest = data;
      $('visitor-portraits').innerHTML = [data[2], data[0], data[6]].map(seal => `<span class="portrait"><img src="${seal.portrait}" alt="${seal.name}" /></span>`).join('') + '<span class="portrait portrait-more">+5</span>';
    },
    progress(count, total) { $('loading-percent').textContent = `${Math.round(count / total * 100)}%`; },
    ready() { $('start-button').disabled = false; $('start-text').textContent = '去喂小海豹'; $('loading-detail').hidden = true; },
    setPlaying(value, gameMode) {
      document.body.classList.toggle('playing', value);
      $('intro').hidden = value;
      $('session-stats').hidden = !value;
      $('feeding-hud').hidden = !value;
      $('pause-button').hidden = !value;
      $('combo').hidden = true;
      $('time-label').textContent = gameMode === 'challenge' ? '剩余时间' : '海湾时光';
    },
    sound(enabled) {
      const label = enabled ? '关闭声音' : '开启声音';
      $('sound-button').innerHTML = icon(enabled ? 'sound-on' : 'sound-off');
      $('sound-button').setAttribute('aria-label', label);
      $('sound-button').title = label;
      $('sound-button').setAttribute('aria-pressed', String(enabled));
    },
    stats(score, seconds, combo) {
      $('score').textContent = score;
      $('timer').textContent = formatTime(seconds);
      $('combo').hidden = combo < 2;
      if (combo >= 2) $('combo').querySelector('strong').textContent = combo;
    },
    power(value, visible) {
      $('power-control').classList.toggle('visible', visible);
      $('power-fill').style.width = `${Math.round(value * 100)}%`;
    },
    notice(message) {
      clearTimeout(noticeTimeout);
      $('feedback').textContent = message;
      $('feedback').classList.add('visible');
      noticeTimeout = setTimeout(() => $('feedback').classList.remove('visible'), 2400);
    },
    meet(id) { seen.add(id); storeValue('seen', [...seen]); },
    results({ score, throws, bestCombo }) {
      const previous = readStored('best', 0);
      storeValue('best', Math.max(previous, score));
      open(`<div class="eyebrow">A BAY FULL OF LITTLE JOYS</div><h2>${score >= 12 ? '今天是人气投喂员！' : '谢谢你带来的小鱼。'}</h2><p>${score > 0 ? `今天，${score} 条小鱼变成了海豹们的小快乐。` : '小海豹们记住你了。放慢一点试试，近处的小家伙会更容易接到。'}</p><div class="result-grid"><div><strong>${score}</strong><span>成功投喂</span></div><div><strong>${throws ? Math.round(score / throws * 100) : 0}%</strong><span>投喂命中率</span></div><div><strong>${bestCombo}</strong><span>最长连续投喂</span></div></div><p>你的最佳记录：${Math.max(previous, score)} 条 · 已认识 ${seen.size} / 8 位海湾居民</p><button class="primary-button" id="again-button">再来一桶小鱼 ${icon('arrow-right')}</button><button class="secondary-button" id="result-home-button">回到海湾首页</button>`, 'results');
      $('again-button').onclick = () => { close(); callbacks.onStart(mode); };
      $('result-home-button').onclick = () => { close(); callbacks.onHome(); };
    },
  };
}
