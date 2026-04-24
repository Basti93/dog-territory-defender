// ─── den-screen.jsx — Phase 1: The Den ──────────────────────────────────────
// Cookie-clicker home base. Three buildings: Doghouse, Treat Bakery, Sniff Garden.
// Treats tick up passively. Buildings are tappable and upgradeable.
// No emoji anywhere — all icons are inline SVG.

// ─── BUILDING DATA ────────────────────────────────────────────────────────────
const BUILDINGS_DATA = {
  doghouse: {
    name: 'Doghouse',
    sub: 'Treat storage capacity',
    color: '#8B6F47',
    lightColor: '#D4A76A',
    costBase: 40,
    costMult: 1.5,
    effect: (lvl) => `Storage: ${100 + lvl * 100} treats`,
    nextEffect: (lvl) => `Storage: ${100 + (lvl + 1) * 100} treats`,
  },
  bakery: {
    name: 'Treat Bakery',
    sub: 'Passive income',
    color: '#C87941',
    lightColor: '#F5CBA7',
    costBase: 60,
    costMult: 1.6,
    effect: (lvl) => `+${(lvl * 0.1).toFixed(1)} treats / sec`,
    nextEffect: (lvl) => `+${((lvl + 1) * 0.1).toFixed(1)} treats / sec`,
  },
  garden: {
    name: 'Sniff Garden',
    sub: 'Collectible find bonus',
    color: '#3A9E5F',
    lightColor: '#A8D5A2',
    costBase: 50,
    costMult: 1.45,
    effect: (lvl) => `+${lvl * 8}% collectibles`,
    nextEffect: (lvl) => `+${(lvl + 1) * 8}% collectibles`,
  },
};

function upgradeCost(key, level) {
  const b = BUILDINGS_DATA[key];
  return Math.floor(b.costBase * Math.pow(b.costMult, level - 1));
}

// ─── SMALL BUILDING ICONS (for cards) ─────────────────────────────────────────
function DogHouseIcon({ size = 24, color = '#8B6F47' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polygon points="12,2 2,10 22,10" fill={color} opacity="0.9"/>
      <rect x="4" y="10" width="16" height="12" rx="1" fill={color} opacity="0.7"/>
      <rect x="9" y="14" width="6" height="8" rx="3 3 0 0" fill="white" opacity="0.6"/>
    </svg>
  );
}

function BakeryIcon({ size = 24, color = '#C87941' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="9" width="18" height="13" rx="2" fill={color} opacity="0.7"/>
      <rect x="3" y="6" width="18" height="5" rx="1" fill={color}/>
      <rect x="14" y="1" width="4" height="7" rx="2" fill={color} opacity="0.8"/>
      <rect x="8" y="13" width="4" height="4" rx="1" fill="white" opacity="0.5"/>
      <rect x="14" y="13" width="4" height="4" rx="1" fill="white" opacity="0.5"/>
    </svg>
  );
}

function GardenIcon({ size = 24, color = '#3A9E5F' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" fill={color} opacity="0.3"/>
      <circle cx="12" cy="12" r="6" fill={color} opacity="0.5"/>
      <circle cx="9" cy="9" r="2.5" fill="#FFB7C5"/>
      <circle cx="9" cy="9" r="1.2" fill="#F39C12"/>
      <circle cx="15" cy="9" r="2.5" fill="#FFB7C5"/>
      <circle cx="15" cy="9" r="1.2" fill="#F39C12"/>
      <circle cx="12" cy="15" r="2.5" fill="#FFB7C5"/>
      <circle cx="12" cy="15" r="1.2" fill="#F39C12"/>
    </svg>
  );
}

// ─── DEN SCENE SVG ────────────────────────────────────────────────────────────
// Top-down view of the dog's home yard. Three building plots on grass.
// Purely decorative/contextual — the interactive elements are the cards below.
function DenScene({ buildings, onTapBuilding }) {
  return (
    <svg width="390" height="178" viewBox="0 0 390 178" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="denGrass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A8D87E" />
          <stop offset="100%" stopColor="#7FBF55" />
        </linearGradient>
        <linearGradient id="roofGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7A5C3A" />
          <stop offset="100%" stopColor="#5C4228" />
        </linearGradient>
      </defs>

      {/* Grass */}
      <rect width="390" height="178" fill="url(#denGrass)" />

      {/* Subtle grass texture */}
      {[28,75,155,225,305,360,18,195,375].map((x, i) => (
        <rect key={i} x={x} y={130 + (i % 3) * 12} width="8" height="3" rx="2"
          fill="#6BAF45" opacity="0.5" />
      ))}

      {/* Stone path dividers between plots */}
      {[128, 258].map((px, pi) =>
        [8, 26, 44, 62, 80, 98, 116, 134, 152].map((py, pj) => (
          <rect key={`${pi}-${pj}`} x={px} y={py} width="24" height="11" rx="5"
            fill="#C8BCA8" opacity="0.75" />
        ))
      )}

      {/* ── Doghouse plot (left) ──────────────────────────────── */}
      <g transform="translate(10, 8)" onClick={() => onTapBuilding('doghouse')}
        style={{ cursor: 'pointer' }}>
        {/* Plot ground */}
        <rect width="112" height="162" rx="12" fill="rgba(160,120,85,0.12)" />
        {/* Roof (top-down triangle) */}
        <polygon points="56,10 8,44 104,44" fill="url(#roofGrad)" />
        <line x1="56" y1="10" x2="56" y2="44" stroke="#4A3220" strokeWidth="2" opacity="0.4" />
        {/* Walls */}
        <rect x="12" y="42" width="88" height="72" rx="4" fill="#C49A6C" />
        {/* Door arch */}
        <path d="M 41 114 L 41 82 Q 56 68 71 82 L 71 114 Z" fill="#5C3D1E" />
        {/* Windows */}
        <rect x="16" y="55" width="18" height="14" rx="3" fill="#B8D9F0" opacity="0.85" />
        <rect x="78" y="55" width="18" height="14" rx="3" fill="#B8D9F0" opacity="0.85" />
        {/* Window cross */}
        <line x1="25" y1="55" x2="25" y2="69" stroke="white" strokeWidth="1" opacity="0.5" />
        <line x1="16" y1="62" x2="34" y2="62" stroke="white" strokeWidth="1" opacity="0.5" />
        <line x1="87" y1="55" x2="87" y2="69" stroke="white" strokeWidth="1" opacity="0.5" />
        <line x1="78" y1="62" x2="96" y2="62" stroke="white" strokeWidth="1" opacity="0.5" />
        {/* Level badge */}
        <rect x="74" y="7" width="32" height="17" rx="8" fill="#7A5C3A" />
        <text x="90" y="19.5" textAnchor="middle" fontSize="9" fill="white"
          fontFamily="Nunito" fontWeight="800">
          L{buildings.doghouse?.level ?? 1}
        </text>
        {/* Label */}
        <text x="56" y="130" textAnchor="middle" fontSize="11" fill="#5C3D1E"
          fontFamily="Nunito" fontWeight="700">Doghouse</text>
        <text x="56" y="145" textAnchor="middle" fontSize="9" fill="#8B6F47"
          fontFamily="Inter">tap to upgrade</text>
      </g>

      {/* ── Treat Bakery plot (center) ────────────────────────── */}
      <g transform="translate(140, 8)" onClick={() => onTapBuilding('bakery')}
        style={{ cursor: 'pointer' }}>
        <rect width="112" height="162" rx="12" fill="rgba(200,120,60,0.1)" />
        {/* Building */}
        <rect x="16" y="40" width="80" height="72" rx="5" fill="#F5CBA7" />
        {/* Roof band */}
        <rect x="16" y="30" width="80" height="18" rx="4" fill="#C87941" />
        {/* Chimney top-view */}
        <circle cx="82" cy="20" r="11" fill="#8B4513" />
        <circle cx="82" cy="20" r="7" fill="#6B3410" />
        <circle cx="82" cy="20" r="3" fill="#3D1A08" />
        {/* Smoke puffs (animated) */}
        <circle cx="79" cy="9" r="4" fill="rgba(210,210,210,0.7)"
          style={{ animation: 'floatUp 2s ease-out infinite' }} />
        <circle cx="74" cy="4" r="3" fill="rgba(210,210,210,0.5)"
          style={{ animation: 'floatUp 2s 0.6s ease-out infinite' }} />
        <circle cx="70" cy="0" r="2" fill="rgba(210,210,210,0.3)"
          style={{ animation: 'floatUp 2s 1.2s ease-out infinite' }} />
        {/* Windows */}
        <rect x="23" y="53" width="18" height="14" rx="2" fill="#B8D9F0" opacity="0.85" />
        <rect x="69" y="53" width="18" height="14" rx="2" fill="#B8D9F0" opacity="0.85" />
        {/* Door */}
        <rect x="39" y="78" width="24" height="34" rx="12 12 0 0" fill="#8B4513" />
        {/* Level badge */}
        <rect x="74" y="7" width="32" height="17" rx="8" fill="#C87941" />
        <text x="90" y="19.5" textAnchor="middle" fontSize="9" fill="white"
          fontFamily="Nunito" fontWeight="800">
          L{buildings.bakery?.level ?? 1}
        </text>
        <text x="56" y="130" textAnchor="middle" fontSize="11" fill="#7D3C00"
          fontFamily="Nunito" fontWeight="700">Treat Bakery</text>
        <text x="56" y="145" textAnchor="middle" fontSize="9" fill="#A0522D"
          fontFamily="Inter">tap to upgrade</text>
      </g>

      {/* ── Sniff Garden plot (right) ─────────────────────────── */}
      <g transform="translate(270, 8)" onClick={() => onTapBuilding('garden')}
        style={{ cursor: 'pointer' }}>
        <rect width="112" height="162" rx="12" fill="rgba(46,204,113,0.08)" />
        {/* Outer garden ring */}
        <circle cx="56" cy="76" r="48" fill="#78C850" opacity="0.35" />
        <circle cx="56" cy="76" r="38" fill="#5FAF3C" opacity="0.35" />
        <circle cx="56" cy="76" r="26" fill="#4A9E30" opacity="0.25" />
        {/* Flower clusters */}
        {[[36, 58], [62, 44], [76, 70], [50, 90], [70, 88], [30, 78], [56, 66]].map(([fx, fy], fi) => (
          <g key={fi}>
            <circle cx={fx} cy={fy} r="6" fill="#FFB7C5" />
            <circle cx={fx} cy={fy} r="3" fill="#F39C12" />
          </g>
        ))}
        {/* Fence posts */}
        {[10, 28, 47, 66, 84, 101].map((fx, fi) => (
          <rect key={fi} x={fx} y="112" width="5" height="14" rx="2.5" fill="#8B6F47" />
        ))}
        {/* Fence rail */}
        <line x1="12" y1="118" x2="103" y2="118" stroke="#8B6F47" strokeWidth="2" opacity="0.5" />
        {/* Level badge */}
        <rect x="74" y="7" width="32" height="17" rx="8" fill="#3A9E5F" />
        <text x="90" y="19.5" textAnchor="middle" fontSize="9" fill="white"
          fontFamily="Nunito" fontWeight="800">
          L{buildings.garden?.level ?? 1}
        </text>
        <text x="56" y="135" textAnchor="middle" fontSize="11" fill="#196F3D"
          fontFamily="Nunito" fontWeight="700">Sniff Garden</text>
        <text x="56" y="150" textAnchor="middle" fontSize="9" fill="#3A9E5F"
          fontFamily="Inter">tap to upgrade</text>
      </g>
    </svg>
  );
}

// ─── UPGRADE MODAL ────────────────────────────────────────────────────────────
function UpgradeModal({ buildingKey, buildings, treats, onUpgrade, onClose }) {
  const { useState: useStateM } = React;
  const [upgraded, setUpgraded] = useStateM(false);

  const data = BUILDINGS_DATA[buildingKey];
  const bld = buildings[buildingKey];
  const level = bld.level;
  const cost = upgradeCost(buildingKey, level + 1);
  const canAfford = treats >= cost;

  const handleUpgrade = () => {
    setUpgraded(true);
    setTimeout(() => { onUpgrade(buildingKey); }, 350);
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)',
      display: 'flex', alignItems: 'flex-end', zIndex: 100,
      animation: 'slideUp 0.25s ease-out',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'white', borderRadius: '24px 24px 0 0',
        width: '100%', padding: '0 0 24px',
        animation: 'slideUp 0.3s ease-out',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: '#E0E0E0', borderRadius: 2, margin: '14px auto 18px' }} />

        <div style={{ padding: '0 20px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${data.lightColor}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {buildingKey === 'doghouse' ? <DogHouseIcon size={26} color={data.color} />
                  : buildingKey === 'bakery' ? <BakeryIcon size={26} color={data.color} />
                    : <GardenIcon size={26} color={data.color} />}
              </div>
              <div>
                <div style={{ fontFamily: 'Nunito', fontWeight: 900, fontSize: 18, color: '#1A2A1A' }}>{data.name}</div>
                <div style={{ fontSize: 11, color: '#8A9A8A', fontFamily: 'Inter' }}>{data.sub}</div>
              </div>
            </div>
            <div style={{
              background: data.color, color: 'white', borderRadius: 10,
              padding: '4px 11px', fontFamily: 'Nunito', fontWeight: 800, fontSize: 13,
            }}>Level {level}</div>
          </div>

          {/* Effect comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', marginBottom: 14 }}>
            <div style={{ background: '#F4F6F0', borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: '#8A9A8A', fontFamily: 'Inter', marginBottom: 3 }}>NOW</div>
              <div style={{ fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, color: '#1A2A1A' }}>{data.effect(level)}</div>
            </div>
            <div style={{ fontSize: 16, color: '#C0C8B8', fontWeight: 700 }}>→</div>
            <div style={{ background: `${data.lightColor}44`, borderRadius: 12, padding: '10px 12px', border: `1.5px solid ${data.color}44` }}>
              <div style={{ fontSize: 10, color: data.color, fontFamily: 'Inter', marginBottom: 3 }}>AFTER</div>
              <div style={{ fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, color: '#1A2A1A' }}>{data.nextEffect(level)}</div>
            </div>
          </div>

          {/* Cost bar */}
          <div style={{
            background: canAfford ? '#E8F5E9' : '#FEF0F0',
            borderRadius: 12, padding: '11px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: canAfford ? 14 : 8,
          }}>
            <span style={{ fontFamily: 'Nunito', fontWeight: 600, fontSize: 13, color: '#1A2A1A' }}>Cost</span>
            <span style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: 16, color: canAfford ? '#27AE60' : '#E74C3C' }}>
              {cost} treats
            </span>
          </div>
          {!canAfford && (
            <div style={{ fontSize: 11, color: '#8A9A8A', textAlign: 'center', marginBottom: 12, fontFamily: 'Inter' }}>
              {cost - Math.floor(treats)} more treats needed — keep the Bakery running
            </div>
          )}

          {/* Upgrade button */}
          <button
            onClick={canAfford ? handleUpgrade : undefined}
            style={{
              width: '100%', border: 'none', borderRadius: 14, padding: '14px',
              cursor: canAfford ? 'pointer' : 'not-allowed',
              background: canAfford
                ? `linear-gradient(135deg, ${data.color}, ${data.lightColor})`
                : '#EBEBEB',
              color: canAfford ? 'white' : '#AAAAAA',
              fontFamily: 'Nunito', fontWeight: 800, fontSize: 16,
              transform: upgraded ? 'scale(0.97)' : 'scale(1)',
              transition: 'transform 0.15s',
            }}
          >
            {canAfford
              ? upgraded ? 'Upgraded!' : `Upgrade to Level ${level + 1}`
              : 'Not enough treats'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DEN SCREEN ───────────────────────────────────────────────────────────────
function DenScreen({ treats, buildings, onUpgrade, tweaks, passiveRate }) {
  const [modal, setModal] = React.useState(null);

  // Find cheapest upgrade for tease row
  const nextEntry = Object.entries(buildings).sort(([ak, av], [bk, bv]) =>
    upgradeCost(ak, av.level + 1) - upgradeCost(bk, bv.level + 1)
  )[0];
  const nextKey = nextEntry[0];
  const nextData = BUILDINGS_DATA[nextKey];
  const nextCost = upgradeCost(nextKey, nextEntry[1].level + 1);
  const progressPct = Math.min(100, (Math.floor(treats) / nextCost) * 100);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F4F6F0', overflowY: 'auto', position: 'relative' }}>
      {/* Garden scene */}
      <div style={{ flexShrink: 0 }}>
        <DenScene buildings={buildings} onTapBuilding={setModal} />
      </div>

      <div style={{ padding: '10px 14px 20px', flex: 1 }}>
        {/* Treats counter */}
        <div style={{
          background: 'white', borderRadius: 16, padding: '13px 16px',
          marginBottom: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontFamily: 'Nunito', fontWeight: 900, fontSize: 26, color: '#1A2A1A', lineHeight: 1 }}>
              {Math.floor(treats).toLocaleString()}
              <span style={{ fontSize: 13, color: '#8A9A8A', fontWeight: 600, marginLeft: 6 }}>treats</span>
            </div>
            <div style={{ fontSize: 11, color: '#3A9E5F', fontFamily: 'Inter', marginTop: 4 }}>
              +{passiveRate.toFixed(2)} per second — Bakery running
            </div>
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg,#FFF3E0,#FFE0B2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BakeryIcon size={26} color="#C87941" />
          </div>
        </div>

        {/* Building cards */}
        {Object.entries(buildings).map(([key, bld], i) => {
          const data = BUILDINGS_DATA[key];
          const cost = upgradeCost(key, bld.level + 1);
          const canAfford = treats >= cost;
          return (
            <div key={key} onClick={() => setModal(key)} style={{
              background: 'white', borderRadius: 16, padding: '13px 14px',
              marginBottom: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center',
              border: `1.5px solid ${canAfford ? data.color + '55' : '#F0F0EC'}`,
              animation: `slideUp 0.35s ${i * 0.08}s ease-out both`,
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 12,
                background: `${data.lightColor}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {key === 'doghouse' ? <DogHouseIcon size={26} color={data.color} />
                  : key === 'bakery' ? <BakeryIcon size={26} color={data.color} />
                    : <GardenIcon size={26} color={data.color} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Nunito', fontWeight: 800, fontSize: 14, color: '#1A2A1A' }}>{data.name}</span>
                  <span style={{ fontFamily: 'Nunito', fontWeight: 700, fontSize: 11, color: data.color, background: `${data.lightColor}66`, padding: '2px 8px', borderRadius: 99 }}>Level {bld.level}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8A9A8A', fontFamily: 'Inter', marginTop: 1 }}>{data.effect(bld.level)}</div>
                <div style={{ fontSize: 11, color: canAfford ? '#27AE60' : '#8A9A8A', marginTop: 2, fontFamily: 'Inter' }}>
                  {canAfford ? `Ready to upgrade — ${cost} treats` : `${cost} treats to upgrade`}
                </div>
              </div>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: canAfford ? '#2ECC71' : '#E0E0DC',
                boxShadow: canAfford ? '0 0 0 3px rgba(46,204,113,0.2)' : 'none',
              }} />
            </div>
          );
        })}

        {/* Next upgrade tease */}
        <div style={{
          background: `${nextData.lightColor}33`,
          borderRadius: 14, padding: '12px 14px', marginTop: 2,
          border: `1.5px dashed ${nextData.color}55`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontFamily: 'Nunito', fontWeight: 700, fontSize: 12, color: '#1A2A1A' }}>
              Next: {nextData.name} Level {nextEntry[1].level + 1}
            </div>
            <div style={{ fontSize: 11, color: nextData.color, fontFamily: 'Nunito', fontWeight: 700 }}>
              {Math.max(0, nextCost - Math.floor(treats))} away
            </div>
          </div>
          <XPBar percent={progressPct} color={nextData.color} animated />
        </div>
      </div>

      {/* Upgrade modal */}
      {modal && (
        <UpgradeModal
          buildingKey={modal}
          buildings={buildings}
          treats={treats}
          onUpgrade={(key) => { onUpgrade(key); setModal(null); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

Object.assign(window, {
  DenScreen, DenScene, UpgradeModal, BUILDINGS_DATA, upgradeCost,
  DogHouseIcon, BakeryIcon, GardenIcon,
});
