// 4-Panel Illustrated Comic-Book Backstory for "Ronin of the Wild"

const PANELS = [
  {
    chapter: 'PANEL I — THE SHIPWRECK',
    sfx: 'KRAAK-BOOM!!',
    caption: 'Years ago, a violent typhoon tore apart the royal vessel off the jagged coast. A young samurai boy washed ashore alone, losing both parents to the black sea.',
    svg: `
      <svg viewBox="0 0 420 240" class="comic-svg">
        <defs>
          <linearGradient id="storm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#0b132b"/>
            <stop offset="65%" stop-color="#1c2541"/>
            <stop offset="100%" stop-color="#0a2e38"/>
          </linearGradient>
        </defs>
        <rect width="420" height="240" fill="url(#storm)"/>
        <polygon points="210,0 185,68 212,68 178,136 238,54 208,54 232,0" fill="#fde047" stroke="#000" stroke-width="3"/>
        <path d="M95,148 L195,118 L245,162 L145,180 Z" fill="#5c3a21" stroke="#000" stroke-width="4"/>
        <line x1="158" y1="128" x2="132" y2="52" stroke="#3b2313" stroke-width="7"/>
        <path d="M134,58 Q175,78 158,118 L112,102 Z" fill="#e2e8f0" stroke="#000" stroke-width="3"/>
        <path d="M0,165 Q55,130 110,165 T220,165 T330,165 T420,155 L420,240 L0,240 Z" fill="#0e7490" stroke="#000" stroke-width="4"/>
        <path d="M0,192 Q65,160 130,192 T260,192 T390,185 L420,240 L0,240 Z" fill="#083344" stroke="#000" stroke-width="4"/>
        <circle cx="320" cy="184" r="9" fill="#dba979" stroke="#000" stroke-width="2.5"/>
        <rect x="302" y="191" width="38" height="10" rx="4" fill="#7c4a21" stroke="#000" stroke-width="2.5"/>
      </svg>
    `
  },
  {
    chapter: 'PANEL II — RAISED BY THE PACK',
    sfx: 'AWOOOOO!!',
    caption: 'Crawling into the ancient mountain forest, the orphan was found by an alpha silver wolf. Like a wild Tarzan of the East, he grew up running with the pack and mastering the untamed woods.',
    svg: `
      <svg viewBox="0 0 420 240" class="comic-svg">
        <rect width="420" height="240" fill="#132a1e"/>
        <circle cx="330" cy="58" r="34" fill="#fef3c7" stroke="#000" stroke-width="3"/>
        <polygon points="20,240 65,65 110,240" fill="#1b4332" stroke="#000" stroke-width="3"/>
        <polygon points="85,240 135,45 185,240" fill="#2d6a4f" stroke="#000" stroke-width="3"/>
        <polygon points="290,240 345,70 400,240" fill="#1b4332" stroke="#000" stroke-width="3"/>
        <path d="M0,195 Q210,168 420,200 L420,240 L0,240 Z" fill="#264628" stroke="#000" stroke-width="4"/>
        <!-- Alpha Wolf silhouette -->
        <path d="M135,190 L145,148 L128,125 L146,130 L165,112 L176,134 L218,142 L236,162 L228,195 L212,195 L208,168 L170,170 L162,195 Z" fill="#cbd5e1" stroke="#000" stroke-width="3.5"/>
        <circle cx="152" cy="136" r="3.5" fill="#fbbf24"/>
        <!-- Young Ronin crouched beside wolf -->
        <circle cx="265" cy="152" r="12" fill="#dba979" stroke="#000" stroke-width="3"/>
        <path d="M248,166 L282,166 L290,202 L242,202 Z" fill="#1e3a5f" stroke="#000" stroke-width="3"/>
        <path d="M245,165 Q265,155 285,165 L280,178 L250,178 Z" fill="#94a3b8" stroke="#000" stroke-width="2.5"/>
      </svg>
    `
  },
  {
    chapter: 'PANEL III — TAI CHI & THE KATANA',
    sfx: 'SHING! WHOOSH!',
    caption: 'Watching falling leaves and rushing rapids, he forged his own fighting style: fluid Tai Chi energy waves, high-speed forest slides, and razor-sharp mastery of his father\'s salvaged katana.',
    svg: `
      <svg viewBox="0 0 420 240" class="comic-svg">
        <rect width="420" height="240" fill="#0f2933"/>
        <!-- Radiant Tai Chi Chi Spiral -->
        <circle cx="210" cy="120" r="88" fill="none" stroke="#2dd4bf" stroke-width="7" stroke-dasharray="28 14" opacity="0.85"/>
        <circle cx="210" cy="120" r="56" fill="none" stroke="#fbbf24" stroke-width="4" opacity="0.9"/>
        <!-- Diagonal katana slash streak -->
        <path d="M40,200 Q210,115 390,35" fill="none" stroke="#e0f2fe" stroke-width="11" stroke-linecap="round"/>
        <path d="M55,205 Q215,122 385,48" fill="none" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/>
        <!-- Samurai Warrior Pose -->
        <circle cx="205" cy="82" r="16" fill="#dba979" stroke="#000" stroke-width="3.5"/>
        <path d="M192,70 Q205,56 220,70 L218,82 L192,82 Z" fill="#111827" stroke="#000" stroke-width="2.5"/>
        <path d="M178,100 L234,100 L248,184 L166,184 Z" fill="#1e293b" stroke="#000" stroke-width="3.5"/>
        <rect x="176" y="138" width="60" height="14" fill="#b91c1c" stroke="#000" stroke-width="2.5"/>
        <line x1="226" y1="126" x2="345" y2="54" stroke="#f8fafc" stroke-width="6" stroke-linecap="round"/>
      </svg>
    `
  },
  {
    chapter: 'PANEL IV — THE IMPERIAL CITY',
    sfx: 'YOUR MISSION BEGINS',
    caption: 'Whispers speak of your lost clan hiding inside the heavily guarded Imperial City beyond the river. Survive the wild, claim a Traveler\'s Disguise, slip past the guards, and find your true people!',
    svg: `
      <svg viewBox="0 0 420 240" class="comic-svg">
        <defs>
          <linearGradient id="sunset" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#7f1d1d"/>
            <stop offset="60%" stop-color="#ea580c"/>
            <stop offset="100%" stop-color="#fde047"/>
          </linearGradient>
        </defs>
        <rect width="420" height="240" fill="url(#sunset)"/>
        <circle cx="210" cy="115" r="52" fill="#fef08a" stroke="#000" stroke-width="3"/>
        <!-- Pagoda City Silhouette -->
        <rect x="165" y="128" width="90" height="90" fill="#1e1b18" stroke="#000" stroke-width="3"/>
        <polygon points="140,132 210,98 280,132" fill="#111" stroke="#000" stroke-width="3"/>
        <polygon points="156,104 210,74 264,104" fill="#991b1b" stroke="#000" stroke-width="3"/>
        <rect x="65" y="150" width="70" height="80" fill="#1c1917" stroke="#000" stroke-width="3"/>
        <polygon points="50,152 100,126 150,152" fill="#111" stroke="#000" stroke-width="3"/>
        <rect x="285" y="150" width="75" height="80" fill="#1c1917" stroke="#000" stroke-width="3"/>
        <polygon points="270,152 322,126 375,152" fill="#111" stroke="#000" stroke-width="3"/>
        <!-- Disguised Ronin Hat Foreground -->
        <polygon points="160,218 210,188 260,218" fill="#d6b575" stroke="#000" stroke-width="3.5"/>
        <path d="M180,218 L240,218 L252,240 L168,240 Z" fill="#44403c" stroke="#000" stroke-width="3"/>
      </svg>
    `
  }
];

export function renderComicIntro(container, onFinish) {
  let index = 0;

  const wrapper = document.createElement('div');
  wrapper.className = 'comic-overlay';

  function draw() {
    const p = PANELS[index];
    const isLast = index === PANELS.length - 1;
    wrapper.innerHTML = `
      <div class="comic-book-frame">
        <div class="comic-top-bar">
          <span class="comic-series">RONIN OF THE WILD — ORIGIN CHRONICLE</span>
          <span class="comic-page-count">${index + 1} / ${PANELS.length}</span>
        </div>
        <div class="comic-panel-box">
          ${p.svg}
          <div class="comic-sfx-burst">${p.sfx}</div>
          <div class="comic-chapter-tag">${p.chapter}</div>
        </div>
        <div class="comic-caption-box">
          <p>${p.caption}</p>
        </div>
        <div class="comic-controls">
          <button class="btn btn-ghost" id="comic-skip">Skip Story</button>
          <div class="comic-nav-right">
            ${index > 0 ? '<button class="btn btn-secondary" id="comic-prev">← Back</button>' : ''}
            <button class="btn btn-gold" id="comic-next">${isLast ? 'Enter the Forest →' : 'Next Panel →'}</button>
          </div>
        </div>
      </div>
    `;

    wrapper.querySelector('#comic-skip').onclick = () => {
      wrapper.remove();
      onFinish();
    };
    const prevBtn = wrapper.querySelector('#comic-prev');
    if (prevBtn) {
      prevBtn.onclick = () => {
        index = Math.max(0, index - 1);
        draw();
      };
    }
    wrapper.querySelector('#comic-next').onclick = () => {
      if (isLast) {
        wrapper.remove();
        onFinish();
      } else {
        index += 1;
        draw();
      }
    };
  }

  draw();
  container.appendChild(wrapper);
}
