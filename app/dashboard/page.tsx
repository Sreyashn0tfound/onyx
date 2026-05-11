'use client';

import { useState, Suspense, useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Stars, Resize, Center, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useRouter } from 'next/navigation';

import { generateRoadmapAction } from '@/app/actions'; 

// 🔥 THE NEW COORDINATES: Sun pushed way back, Moon set up to orbit.
const SUN_POS: [number, number, number] = [0, 15, -80];

const ORBITAL_NODES = [
  { id: 1, name: "Fractured Earth", url: "/planet1.glb", color: "#3b82f6", pos: [-45, 0, 10], scale: 12, route: "/dashboard/phase/1" },
  { id: 2, name: "Volcanic Forge",  url: "/planet2.glb", color: "#f97316", pos: [-22.5, 0, -5], scale: 12, route: "/dashboard/phase/2" },
  { id: 3, name: "Amethyst Core",   url: "/planet3.glb", color: "#a855f7", pos: [0, 0, -15], scale: 12, route: "/dashboard/phase/3" },
  { id: 4, name: "Aegis Halo",      url: "/planet4.glb", color: "#6366f1", pos: [22.5, 0, -5], scale: 12, route: "/dashboard/phase/4" },
  { id: 5, name: "Glacial Nexus",   url: "/planet5.glb", color: "#22d3ee", pos: [45, 0, 10], scale: 12, route: "/dashboard/phase/5" },
  
  // ☀️ THE FINAL TECH BOSS
  { id: 100, name: "The Core (Tech Boss)", url: "/sun.glb", color: "#fbbf24", pos: SUN_POS, scale: 50, route: "/dashboard/phase/100", isSpecial: true }
];

// 🌙 THE MOON DATA 
const MOON_NODE = { id: 99, name: "HR Basecamp", url: "/moon.glb", color: "#e2e8f0", orbitCenter: SUN_POS, orbitRadius: 60, scale: 8, route: "/dashboard/phase/99" };

// 🕳️ THE BLACK HOLE DATA (Massive abyss lurking beneath the solar system)
// 🕳️ THE BLACK HOLE DATA (Massive abyss lurking beneath the solar system)
const BLACKHOLE_NODE = { 
  id: 999, 
  name: "The Black Hole Arena", 
  url: "/blackhole.glb", 
  color: "#a855f7", 
  pos: [0, -80, -120] as [number, number, number], // 🔥 THE FIX: Explicitly cast as a 3-coordinate tuple
  scale: 180,          
  route: "/dashboard/arena" 
};


const SpaceSky = () => {
  const { scene } = useGLTF('/space_sky.glb') as any;
  return (
    <group>
      <Stars radius={150} depth={50} count={3000} factor={4} fade speed={1} />
      <primitive object={scene} scale={500} />
    </group>
  );
};

const IdleSpaceship = () => {
  const { scene } = useGLTF('/spaceship.glb') as any;
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.5;
      ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 1) * 0.05;
      ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
  });
  return (
    <group ref={ref} position={[-8, 0, 0]}>
      <Center><Resize scale={8}><primitive object={scene} /></Resize></Center>
      <pointLight distance={20} intensity={20} color="#0a84ff" position={[0, -2, -5]} />
    </group>
  );
};

// --- STATIC PLANET & SUN RENDERER ---
const RoadmapPlanet = ({ data, highestUnlockedPhase }: { data: any, highestUnlockedPhase: number }) => {
  const { scene } = useGLTF(data.url) as any;
  const ref = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const copiedScene = useMemo(() => scene.clone(), [scene]);
  const router = useRouter();

  let isLocked = false;
  if (data.id === 100) isLocked = highestUnlockedPhase <= 5; 
  else isLocked = data.id > highestUnlockedPhase; 

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * (data.id === 100 ? 0.02 : 0.2); 
      const targetScale = (hovered && !isLocked) ? 1.05 : 1.0;
      ref.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
  });

  const uiColor = isLocked ? "#ef4444" : data.color;

  return (
    <group 
      position={data.pos} 
      ref={ref}
      onClick={(e) => { e.stopPropagation(); if (!isLocked) router.push(data.route); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = isLocked ? 'not-allowed' : 'crosshair'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
    >
      <Center><Resize scale={data.scale}><primitive object={copiedScene} /></Resize></Center>
      <pointLight distance={data.id === 100 ? 200 : (hovered ? 60 : 40)} intensity={data.id === 100 ? 100 : (hovered ? 60 : 30)} color={isLocked ? "#ef4444" : data.color} />
      
      {hovered && (
        <Html position={[0, (data.scale * 0.8), 0]} center zIndexRange={[100, 0]}>
          <div className="flex flex-col items-center justify-center bg-[#0a0a0a]/90 backdrop-blur-md px-6 py-3 rounded-2xl pointer-events-none shadow-2xl" style={{ border: `1px solid ${uiColor}50`, boxShadow: `0 10px 30px -10px ${uiColor}80` }}>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] mb-1" style={{ color: uiColor }}>
              {isLocked ? `LOCKED` : (data.isSpecial ? "RESTRICTED ACCESS" : `Phase 0${data.id}`)}
            </span>
            <span className="text-white text-lg font-bold tracking-tighter whitespace-nowrap uppercase">{data.name}</span>
            <span className={`text-xs mt-1 uppercase tracking-widest ${isLocked ? 'text-red-400' : 'text-gray-400'}`}>
              {isLocked ? (data.id === 100 ? "Clear Phase 5 to unlock" : "Clear previous node to unlock") : "Click to Enter Orbit"}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
};

// --- ORBITING MOON RENDERER ---
const RoadmapOrbitingMoon = ({ data }: { data: typeof MOON_NODE }) => {
  const { scene } = useGLTF(data.url) as any;
  const orbitGroupRef = useRef<THREE.Group>(null);
  const moonRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const copiedScene = useMemo(() => scene.clone(), [scene]);
  const router = useRouter();

  useFrame((state, delta) => {
    if (orbitGroupRef.current) {
      orbitGroupRef.current.rotation.y += delta * 0.05; 
    }
    if (moonRef.current) {
      moonRef.current.rotation.y += delta * 0.2;
      const targetScale = hovered ? 1.15 : 1.0;
      moonRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
  });

  return (
    <group position={data.orbitCenter} ref={orbitGroupRef}>
      <group 
        position={[data.orbitRadius, 0, 0]} 
        ref={moonRef}
        onClick={(e) => { e.stopPropagation(); router.push(data.route); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'crosshair'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        <Center><Resize scale={data.scale}><primitive object={copiedScene} /></Resize></Center>
        <pointLight distance={40} intensity={hovered ? 60 : 30} color={data.color} />
        
        {hovered && (
          <Html position={[0, (data.scale * 1.2), 0]} center zIndexRange={[100, 0]}>
            <div className="flex flex-col items-center justify-center bg-[#0a0a0a]/90 backdrop-blur-md px-6 py-3 rounded-2xl pointer-events-none shadow-2xl" style={{ border: `1px solid ${data.color}50` }}>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] mb-1" style={{ color: data.color }}>UNRESTRICTED ACCESS</span>
              <span className="text-white text-lg font-bold tracking-tighter whitespace-nowrap uppercase">{data.name}</span>
              <span className="text-xs mt-1 uppercase tracking-widest text-gray-400">Click to Enter Orbit</span>
            </div>
          </Html>
        )}
      </group>
    </group>
  );
};

// --- 🔥 THE BLACK HOLE RENDERER ---
const RoadmapBlackHole = ({ data }: { data: typeof BLACKHOLE_NODE }) => {
  const { scene } = useGLTF(data.url) as any;
  const ref = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const copiedScene = useMemo(() => scene.clone(), [scene]);
  const router = useRouter();

  useFrame((state, delta) => {
    if (ref.current) {
      // Aggressive spin for the black hole
      ref.current.rotation.y -= delta * 0.5;
      ref.current.rotation.z -= delta * 0.2;
      const targetScale = hovered ? 1.15 : 1.0;
      ref.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
  });

  return (
    <group 
      position={data.pos} 
      ref={ref}
      onClick={(e) => { e.stopPropagation(); router.push(data.route); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'crosshair'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
    >
      <Center><Resize scale={data.scale}><primitive object={copiedScene} /></Resize></Center>
      
      {/* Expanded gravity glow to match the massive size */}
      <pointLight distance={400} intensity={hovered ? 300 : 150} color={data.color} />
      
      {hovered && (
        // Adjusted the Y-multiplier to 0.4 so the label stays near the event horizon
        <Html position={[0, (data.scale * 0.4), 0]} center zIndexRange={[100, 0]}>
          <div className="flex flex-col items-center justify-center bg-[#050505]/95 backdrop-blur-md px-6 py-3 rounded-2xl pointer-events-none shadow-2xl" style={{ border: `1px solid ${data.color}80`, boxShadow: `0 0 40px ${data.color}40` }}>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] mb-1 text-purple-400 animate-pulse">WARNING: SUPERMASSIVE ANOMALY</span>
            <span className="text-white text-lg font-bold tracking-tighter whitespace-nowrap uppercase">{data.name}</span>
            <span className="text-xs mt-1 uppercase tracking-widest text-gray-400">Click to Enter Arena</span>
          </div>
        </Html>
      )}
    </group>
  );
};

export default function Dashboard() {
  const router = useRouter();
  const [appState, setAppState] = useState<'intake' | 'generating' | 'map'>('intake');
  const [isFormLocked, setIsFormLocked] = useState(false);
  const [isSimpleMode, setIsSimpleMode] = useState(false);
  
  const [highestUnlockedPhase, setHighestUnlockedPhase] = useState(1);
  const [formData, setFormData] = useState({ fullName: '', linkedin: '', github: '', targetCompany: '', targetRole: '', currentYear: '3rd Year', missingSkills: '' });
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  useEffect(() => {
    const savedState = sessionStorage.getItem('onyx_appState');
    if (savedState === 'map') {
      setAppState('map');
      setIsFormLocked(true);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setFormData({ ...formData, [e.target.name]: e.target.value }); };

  const handleGenerate = async () => {
    if (isFormLocked) { setAppState('map'); return; }
    setAppState('generating');
    try {
      const result = await generateRoadmapAction(formData, resumeFile !== null, "user_12345", "student@ncet.edu");
      if (result.success) {
        setIsFormLocked(true); 
        setAppState('map');
        sessionStorage.setItem('onyx_appState', 'map');
      } else { alert(`Core Failure: ${result.error}`); setAppState('intake'); }
    } catch (error) { alert("Critical Connection Lost."); setAppState('intake'); }
  };

  return (
    <div className="w-full h-screen bg-black relative font-sans text-white overflow-hidden">
      
      {/* PERFORMANCE TOGGLE BUTTON */}
      <button onClick={() => setIsSimpleMode(!isSimpleMode)} className="absolute top-4 left-6 z-50 px-4 py-2 bg-black/40 border border-white/10 hover:bg-white/10 rounded-full font-mono text-[10px] text-gray-300 uppercase tracking-widest transition-colors backdrop-blur-md flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isSimpleMode ? 'bg-green-500' : 'bg-[#0a84ff] animate-pulse shadow-[0_0_10px_#0a84ff]'}`} />
        {isSimpleMode ? "2D Mode Active" : "3D Engine Active"}
      </button>

      {/* DEV TESTING BYPASS BUTTONS */}
      <div className="absolute top-4 right-6 z-50 flex gap-4">
        <button onClick={() => setHighestUnlockedPhase(6)} className="text-[10px] font-mono text-white/20 hover:text-green-500 uppercase tracking-widest transition-colors">[Dev: Unlock All Planets]</button>
        <button onClick={() => { setIsFormLocked(false); sessionStorage.removeItem('onyx_appState'); }} className="text-[10px] font-mono text-white/20 hover:text-red-500 uppercase tracking-widest transition-colors">[Dev: Reset Telemetry]</button>
      </div>

      {/* GLASSMORPHIC MAP LEGEND */}
      {appState === 'map' && !isSimpleMode && (
        <div className="absolute top-20 left-6 z-40 w-[340px] bg-white/5 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl pointer-events-none animate-in slide-in-from-left-8 duration-1000 hidden md:block">
          <h3 className="text-white font-mono text-[10px] font-bold tracking-[0.2em] uppercase mb-6 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Orbital Legend
          </h3>
          <ul className="space-y-6 text-sm text-gray-300">
            <li className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center shrink-0"><span className="text-xs font-mono text-blue-400">1-5</span></div>
              <p><strong className="text-white block mb-1 uppercase tracking-widest text-[10px]">Technical Nodes</strong> Clear each phase sequentially using the AST Grader to unlock the next.</p>
            </li>
            <li className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-white/10 border border-white/30 flex items-center justify-center shrink-0"><span className="text-xs font-mono text-white">HR</span></div>
              <p><strong className="text-white block mb-1 uppercase tracking-widest text-[10px]">The Moon</strong> Behavioral and Soft Skills evaluation. Accessible at any time.</p>
            </li>
            <li className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/50 flex items-center justify-center shrink-0"><span className="text-xs font-mono text-yellow-400">★</span></div>
              <p><strong className="text-white block mb-1 uppercase tracking-widest text-[10px]">The Core</strong> Final FAANG Architecture Boss. Unlocks only after Phase 5 is secured.</p>
            </li>
            {/* 🔥 ADDED THE BLACK HOLE TO THE LEGEND */}
            <li className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/50 flex items-center justify-center shrink-0"><span className="text-xs font-mono text-purple-400">BH</span></div>
              <p><strong className="text-purple-400 block mb-1 uppercase tracking-widest text-[10px]">The Arena</strong> Endless LeetCode survival mode. Build your global Onyx Elo here.</p>
            </li>
          </ul>
        </div>
      )}

      {/* 3D ENGINE */}
      <div className="absolute inset-0 z-0">
        {isSimpleMode ? (
          <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-black to-black opacity-80" />
        ) : (
          <Canvas dpr={[1, 1.5]} camera={{ position: [0, appState === 'map' ? 5 : 0, appState === 'map' ? 75 : 20], fov: 45 }}>
            <ambientLight intensity={1.5} />
            <Suspense fallback={null}>
              <SpaceSky />
              {(appState === 'intake' || appState === 'generating') && <IdleSpaceship />}
              
              {appState === 'map' && (
                <>
                  {ORBITAL_NODES.map((node) => (
                    <RoadmapPlanet key={node.id} data={node} highestUnlockedPhase={highestUnlockedPhase} />
                  ))}
                  {/* The Orbiting Moon */}
                  <RoadmapOrbitingMoon data={MOON_NODE} />
                  
                  {/* 🔥 The Black Hole Abyss */}
                  <RoadmapBlackHole data={BLACKHOLE_NODE} />
                </>
              )}
            </Suspense>
            <OrbitControls enableZoom={appState === 'map'} enablePan={false} maxDistance={200} minDistance={20} autoRotate={appState === 'intake'} autoRotateSpeed={0.5} />
            <EffectComposer><Bloom luminanceThreshold={0.2} intensity={1.5} /></EffectComposer>
          </Canvas>
        )}
      </div>

      {/* --- 2D MAP FALLBACK UI --- */}
      {appState === 'map' && isSimpleMode && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-16 animate-in fade-in duration-500 overflow-y-auto">
          <h2 className="text-3xl font-bold uppercase tracking-widest text-white mb-12 shrink-0">2D Orbital Route</h2>
          <div className="flex flex-wrap justify-center gap-6 max-w-6xl w-full">
            
            {ORBITAL_NODES.map((node) => {
              let isLocked = false;
              if (node.id === 100) isLocked = highestUnlockedPhase <= 5;
              else isLocked = node.id > highestUnlockedPhase;

              return (
                <div key={node.id} onClick={() => { if (!isLocked) router.push(node.route); }} className={`p-6 w-64 rounded-2xl border bg-black/50 backdrop-blur-md transition-all ${isLocked ? 'border-red-500/30 opacity-50 cursor-not-allowed' : 'border-white/20 hover:border-white/50 hover:scale-[1.02] cursor-pointer'}`} style={!isLocked ? { borderTop: `2px solid ${node.color}` } : {}}>
                  <div className="text-xs font-mono mb-2" style={{ color: isLocked ? '#ef4444' : node.color }}>{node.isSpecial ? "RESTRICTED" : `PHASE 0${node.id}`}</div>
                  <div className="text-xl font-bold uppercase tracking-tight text-white mb-2">{node.name}</div>
                  <div className="text-xs uppercase tracking-widest text-gray-400">{isLocked ? 'Locked' : 'Enter Orbit'}</div>
                </div>
              );
            })}

            <div onClick={() => router.push(MOON_NODE.route)} className={`p-6 w-64 rounded-2xl border bg-black/50 backdrop-blur-md transition-all border-white/20 hover:border-white/50 hover:scale-[1.02] cursor-pointer`} style={{ borderTop: `2px solid ${MOON_NODE.color}` }}>
              <div className="text-xs font-mono mb-2" style={{ color: MOON_NODE.color }}>UNRESTRICTED</div>
              <div className="text-xl font-bold uppercase tracking-tight text-white mb-2">{MOON_NODE.name}</div>
              <div className="text-xs uppercase tracking-widest text-gray-400">Enter Orbit</div>
            </div>

            {/* 🔥 Render Black Hole in 2D */}
            <div onClick={() => router.push(BLACKHOLE_NODE.route)} className={`p-6 w-64 rounded-2xl border bg-black/50 backdrop-blur-md transition-all border-white/20 hover:border-purple-500/50 hover:scale-[1.02] cursor-pointer shadow-[inset_0_0_20px_rgba(168,85,247,0.2)]`} style={{ borderTop: `2px solid ${BLACKHOLE_NODE.color}` }}>
              <div className="text-xs font-mono mb-2 animate-pulse" style={{ color: BLACKHOLE_NODE.color }}>ANOMALY DETECTED</div>
              <div className="text-xl font-bold uppercase tracking-tight text-white mb-2">{BLACKHOLE_NODE.name}</div>
              <div className="text-xs uppercase tracking-widest text-gray-400">Enter The Arena</div>
            </div>

          </div>
        </div>
      )}

      {/* --- INTAKE UI --- */}
      {appState === 'intake' && (
        <div className="absolute inset-0 z-10 flex items-center justify-end p-16 pointer-events-none">
          <div className="w-[600px] bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 p-10 rounded-[2rem] pointer-events-auto shadow-2xl animate-in fade-in slide-in-from-right-8 duration-700 relative overflow-hidden">
            {isFormLocked && <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-10 pointer-events-none border border-[#0a84ff]/30 rounded-[2rem]" />}
            <h1 className="text-4xl font-bold tracking-tighter uppercase mb-2">{isFormLocked ? "Telemetry Locked" : "Initialize Core"}</h1>
            <p className="text-[#a1a1a6] font-mono text-xs tracking-widest uppercase mb-8">{isFormLocked ? "Route already calculated and stored in database." : "Supply telemetry to calculate optimal route."}</p>
            <div className={`space-y-4 mb-8 relative z-0 ${isFormLocked ? 'opacity-50' : ''}`}>
              <input type="text" name="fullName" disabled={isFormLocked} placeholder="Full Name" onChange={handleInputChange} className="w-full p-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#0a84ff] outline-none transition-colors text-sm disabled:cursor-not-allowed" />
              <div className="flex gap-4">
                <input type="text" name="targetCompany" disabled={isFormLocked} placeholder="Target Enterprise (e.g. Google)" onChange={handleInputChange} className="w-1/2 p-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#bf5af2] outline-none transition-colors text-sm disabled:cursor-not-allowed" />
                <input type="text" name="targetRole" disabled={isFormLocked} placeholder="Target Role (e.g. SDE)" onChange={handleInputChange} className="w-1/2 p-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#bf5af2] outline-none transition-colors text-sm disabled:cursor-not-allowed" />
              </div>
              <select name="currentYear" disabled={isFormLocked} onChange={handleInputChange} defaultValue="3rd Year" className="w-full p-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#bf5af2] outline-none transition-colors text-sm text-[#a1a1a6] disabled:cursor-not-allowed">
                <option value="1st Year">1st Year (Beginner Protocol)</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
                <option value="Graduated">Graduated</option>
              </select>
            </div>
            <button onClick={handleGenerate} disabled={(!isFormLocked && (!formData.fullName || !formData.targetCompany))} className="w-full relative z-20 bg-white text-black p-5 rounded-xl font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100">
              {isFormLocked ? "Return to Galaxy Map" : "Calculate Route"}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}