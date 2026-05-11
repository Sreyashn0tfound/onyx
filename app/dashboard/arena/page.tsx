'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trophy } from 'lucide-react';

export default function BlackHoleArena() {
  const router = useRouter();
  const [elo, setElo] = useState<number>(1000);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const glassClasses = "bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/10 rounded-[2rem] shadow-2xl";

  useEffect(() => {
    const savedElo = parseInt(localStorage.getItem('onyx_elo') || '1000');
    setElo(savedElo);
    generateLeaderboard(savedElo);
  }, []);

  const generateLeaderboard = (playerElo: number) => {
    const bots = [
      { name: "Onyx_Prime", elo: 2850, isPlayer: false },
      { name: "FAANG_Slayer", elo: 2100, isPlayer: false },
      { name: "Null_Pointer", elo: 1650, isPlayer: false },
      { name: "Script_Kiddie", elo: 800, isPlayer: false },
      { name: "You (Candidate)", elo: playerElo, isPlayer: true }
    ];
    setLeaderboard(bots.sort((a, b) => b.elo - a.elo));
  };

  const enterBlackHole = (difficulty: string) => {
    // Save the selected difficulty to local memory, then warp to the coding page
    sessionStorage.setItem('onyx_arena_difficulty', difficulty);
    router.push('/dashboard/arena/code');
  };

  return (
    <div className="w-full min-h-screen bg-black font-sans text-white p-10 relative overflow-hidden flex flex-col items-center justify-center">
      
      {/* MASSIVE GLOWING BACKGROUND */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-600/20 rounded-full blur-[150px] pointer-events-none z-0 animate-pulse"></div>

      <div className="w-full max-w-6xl relative z-10">
        <div className="flex justify-between items-center mb-10">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-gray-400 font-mono text-xs uppercase tracking-widest hover:text-white transition-colors">
            <ChevronLeft size={16} /> Retreat from Orbit
          </button>
          <div className="px-6 py-2 rounded-full font-mono text-xs font-bold uppercase tracking-widest border border-purple-500/50 text-purple-400 bg-purple-500/10 shadow-[0_0_30px_rgba(168,85,247,0.4)]">
            The Black Hole Arena
          </div>
        </div>

        <div className="flex gap-8 h-[600px]">
          
          {/* LEADERBOARD */}
          <div className={`${glassClasses} flex-1 p-8 flex flex-col border-t-2 border-t-purple-500`}>
            <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
              <Trophy className="text-purple-500" size={28} />
              <h2 className="font-bold text-2xl uppercase tracking-widest text-white">Global Ranks</h2>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
              {leaderboard.map((player, idx) => (
                <div key={idx} className={`flex justify-between items-center p-4 rounded-xl border ${player.isPlayer ? 'bg-purple-500/20 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-white/5 border-white/5'}`}>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm text-gray-500">#{idx + 1}</span>
                    <span className={`font-bold text-lg ${player.isPlayer ? 'text-white' : 'text-gray-300'}`}>{player.name}</span>
                  </div>
                  <span className="font-mono text-lg font-bold text-purple-400">{player.elo}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ANOMALY SELECTOR */}
          <div className={`${glassClasses} w-[450px] p-8 flex flex-col shrink-0`}>
             <h2 className="font-mono text-sm uppercase tracking-widest text-gray-400 mb-8 border-b border-white/10 pb-4">Select Singularity Vector</h2>
             <div className="space-y-6">
               <button onClick={() => enterBlackHole('Warm-up (Easy)')} className="w-full p-6 rounded-2xl border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all text-left flex justify-between items-center group">
                 <span className="font-bold text-lg uppercase tracking-widest">Warm-up</span> 
                 <span className="font-mono text-sm bg-green-500/20 px-3 py-1 rounded-full group-hover:animate-pulse">+10 Elo</span>
               </button>
               <button onClick={() => enterBlackHole('Optimization (Medium)')} className="w-full p-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-all text-left flex justify-between items-center group">
                 <span className="font-bold text-lg uppercase tracking-widest">Optimization</span> 
                 <span className="font-mono text-sm bg-yellow-500/20 px-3 py-1 rounded-full group-hover:animate-pulse">+25 Elo</span>
               </button>
               <button onClick={() => enterBlackHole('Boss Fight (Hard)')} className="w-full p-6 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-left flex justify-between items-center group">
                 <span className="font-bold text-lg uppercase tracking-widest">Boss Fight</span> 
                 <span className="font-mono text-sm bg-red-500/20 px-3 py-1 rounded-full group-hover:animate-pulse">+50 Elo</span>
               </button>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}