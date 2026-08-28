import fs from 'fs';

let content = fs.readFileSync('client/src/styles.css', 'utf8');

const replacements = [
  // 1. MW PANEL
  {
    find: `.mw-panel {
  background: var(--bg-panel); border-radius: 16px; padding: 24px;
  border: 1px solid var(--line); margin-bottom: 24px;
}`,
    replace: `.mw-panel {
  position: relative;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 2rem;
  padding: 32px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  margin-bottom: 24px;
  z-index: 1;
}
.mw-panel::before {
  content: "";
  position: absolute;
  inset: 8px;
  z-index: -1;
  background: rgba(10, 15, 25, 0.6);
  backdrop-filter: blur(24px);
  border-radius: calc(2rem - 8px);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 10px 40px rgba(0,0,0,0.5);
}`
  },

  // 2. ROLE CARD
  {
    find: `.role-card {
  background: var(--bg-panel); border: 1px solid var(--line); border-radius: 16px;
  padding: 30px; text-align: center; margin: 20px 0;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  position: relative; overflow: hidden;
}`,
    replace: `.role-card {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 2rem;
  padding: 36px 20px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  z-index: 1;
  transition: transform 0.6s cubic-bezier(0.32, 0.72, 0, 1);
  text-align: center; margin: 20px 0;
}
.role-card::before {
  content: "";
  position: absolute;
  inset: 8px;
  z-index: -1;
  background: rgba(10, 15, 25, 0.6);
  backdrop-filter: blur(24px);
  border-radius: calc(2rem - 8px);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 10px 40px rgba(0,0,0,0.5);
  transition: background 0.4s ease;
}
.role-card:hover { transform: scale(1.02); }
.role-card:hover::before { background: rgba(20, 25, 40, 0.8); }
.role-card:active { transform: scale(0.97); }`
  },

  // 3. BUTTONS
  {
    find: `/* Buttons & Inputs */
.mw-btn { 
  background: var(--hago-blue-light); color: #FFF; border: none; border-radius: 999px;
  padding: 12px 24px; font-size: 15px; font-weight: 600; cursor: pointer; transition: 0.2s;
  box-shadow: 0 4px 12px rgba(42, 91, 211, 0.4);
}
.mw-btn:active { transform: scale(0.95); }
.mw-btn-amber { background: linear-gradient(180deg, var(--lantern), var(--lantern-deep)); color: #120A01; box-shadow: 0 4px 12px rgba(255,179,71,0.3); }`,
    replace: `/* Buttons & Inputs */
.mw-btn { 
  position: relative; overflow: hidden;
  background: rgba(255, 255, 255, 0.9); color: #000; border: none; border-radius: 999px;
  padding: 12px 24px; font-size: 15px; font-weight: 700; cursor: pointer;
  transition: transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), background 0.3s ease;
  box-shadow: 0 4px 20px rgba(255, 255, 255, 0.1);
}
.mw-btn:active { transform: scale(0.95); }
.mw-btn-amber { 
  background: linear-gradient(180deg, var(--lantern), var(--lantern-deep)); 
  color: #120A01; 
  box-shadow: 0 8px 24px rgba(255,179,71,0.3); 
}`
  },

  // 4. NIGHT OVERLAYS
  {
    find: `.mw-root.is-night {
  background: radial-gradient(circle at 50% -20%, #080c1f 0%, #020306 80%);
}`,
    replace: `.mw-root.is-night {
  background: #000;
}
.mw-root.is-night .mw-bg-premium-art::after {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(circle at center, rgba(5,5,10,0.6) 0%, rgba(0,0,0,0.95) 100%);
  z-index: 1;
}
.mw-root:not(.is-night) .mw-bg-premium-art::after {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(circle at center, transparent 0%, rgba(5,5,5,0.7) 100%);
  z-index: 1;
}`
  },

  // 5. INPUTS
  {
    find: `.mw-input { background: rgba(0,0,0,0.5); border: 1px solid var(--line); border-radius: 12px; color: #FFF; padding: 12px; font-size: 14px; width: 100%; outline: none; }
.mw-input:focus { border-color: var(--hago-blue-light); }`,
    replace: `.mw-input { 
  width: 100%; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px; padding: 16px; font-size: 15px; color: #FFF; outline: none;
  transition: border-color 0.2s; 
}
.mw-input:focus { border-color: rgba(255,255,255,0.3); }`
  }
];

let ok = true;
for (const r of replacements) {
  if (content.includes(r.find)) {
    content = content.replace(r.find, r.replace);
  } else {
    console.error('COULD NOT FIND:', r.find.substring(0, 50));
    ok = false;
  }
}

if (ok) {
  fs.writeFileSync('client/src/styles.css', content);
  console.log('styles.css successfully upgraded to Pro Max!');
} else {
  console.error('Failed to upgrade styles.css');
}
