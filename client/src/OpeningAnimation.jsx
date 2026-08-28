import React, { useEffect, useState } from 'react';
import { PawPrint, Crown, Ghost, Eye, Shield, Sun, Users, User } from 'lucide-react';

const ROLE_ICONS = {
  werewolf_biasa: PawPrint, alpha_wolf: Crown, joker: Ghost, seer: Eye, guard: Shield,
  witch: Sun, hunter: Shield, cupid: Users, villager: User,
};

// Mapping role teams
const getTeam = (role) => {
  if (role === 'werewolf_biasa' || role === 'alpha_wolf') return 'evil';
  return 'good';
};

export default function OpeningAnimation({ players, onComplete }) {
  const [stage, setStage] = useState('intro'); // 'intro', 'vs', 'outro'

  useEffect(() => {
    const t1 = setTimeout(() => setStage('vs'), 1000); // 1s intro
    const t2 = setTimeout(() => setStage('outro'), 4500); // 3.5s vs
    const t3 = setTimeout(() => onComplete(), 5500); // 1s outro
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const goodPlayers = players.filter(p => getTeam(p.role) === 'good');
  const evilPlayers = players.filter(p => getTeam(p.role) === 'evil');

  return (
    <div className={`hago-opening-overlay stage-${stage}`}>
      {/* Intro Text */}
      {stage === 'intro' && (
        <div className="opening-text fade-in-out">
          <h1>Malam Serigala</h1>
          <p>Permainan Dimulai...</p>
        </div>
      )}

      {/* VS Screen */}
      {(stage === 'vs' || stage === 'outro') && (
        <div className="vs-screen">
          <div className="vs-team evil-team slide-in-top">
            <h2 className="team-title"><span className="emoji">😈</span> Evil Team</h2>
            <div className="team-cards">
              {evilPlayers.map(p => {
                const Icon = ROLE_ICONS[p.role] || ROLE_ICONS['werewolf_biasa'];
                return (
                  <div key={p.id} className="opening-card evil-card">
                    <Icon size={24} />
                    <span>{p.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="vs-divider zoom-in">VS</div>
          
          <div className="vs-team good-team slide-in-bottom">
            <div className="team-cards">
              {goodPlayers.map(p => {
                const Icon = ROLE_ICONS[p.role] || ROLE_ICONS['villager'];
                return (
                  <div key={p.id} className="opening-card good-card">
                    <Icon size={24} />
                    <span>{p.name}</span>
                  </div>
                );
              })}
            </div>
            <h2 className="team-title"><span className="emoji">😇</span> Good Team</h2>
          </div>
        </div>
      )}
    </div>
  );
}
