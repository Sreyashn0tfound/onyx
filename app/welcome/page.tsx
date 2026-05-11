'use client';

import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Float, useProgress } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Suspense, useState, useRef } from 'react';
import { Station } from '../components/Station'; 

// --- GLOBAL AUDIO UTILITY ---
const playUI_SFX = (soundName: string) => {
  if (typeof window !== 'undefined') {
    const audio = new Audio(`/${soundName}.mp3`);
    audio.volume = 0.3;
    audio.play().catch(() => {}); 
  }
};

// --- DYNAMIC TERMINAL LOADER ---
const TerminalLoader = () => {
  const { active, progress } = useProgress();
  
  if (!active) return null;

  let loadingText = "ESTABLISHING UPLINK...";
  if (progress > 30) loadingText = "SYNCING ATS TELEMETRY...";
  if (progress > 60) loadingText = "DECRYPTING ORBITAL COMMAND...";
  if (progress > 90) loadingText = "SECURING VAULT ACCESS...";

  return (
    <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505]">
      <div className="w-72 flex flex-col gap-4 animate-in fade-in duration-500">
        <div className="flex justify-between items-end">
          <span className="text-xs font-mono tracking-[0.2em] text-[#0a84ff] uppercase">{loadingText}</span>
          <span className="text-xs font-mono tracking-widest text-[#a1a1a6]">{progress.toFixed(0)}%</span>
        </div>
        <div className="w-full h-[2px] bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#0a84ff] shadow-[0_0_15px_rgba(10,132,255,0.8)] transition-all duration-300 ease-out" 
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <div className="text-[10px] font-mono text-[#515154] tracking-widest break-all leading-relaxed opacity-60">
          0x0A1 0xB2C 0xC3D 0xD4E 0xE5F 0xF60 0x071
        </div>
      </div>
    </div>
  );
};

// --- UPGRADED FREE-MODE CAMERA RIG ---
const CameraRig = ({ activeNode, isEnteringVault, controlsRef }: any) => {
  const vec = new THREE.Vector3();
  const target = new THREE.Vector3();

  useFrame((state) => {
    if (isEnteringVault) {
      vec.set(0, 0, -1); 
      target.set(0, 0, -10); 
      state.camera.position.lerp(vec, 0.06); 
      if (controlsRef.current) controlsRef.current.target.lerp(target, 0.06);
    } else if (activeNode) {
      vec.set(activeNode.camPos[0], activeNode.camPos[1], activeNode.camPos[2]);
      target.set(activeNode.lookAt[0], activeNode.lookAt[1], activeNode.lookAt[2]);
      state.camera.position.lerp(vec, 0.05);
      if (controlsRef.current) controlsRef.current.target.lerp(target, 0.05);
    } else {
      target.set(0, 0, 0);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(target, 0.05);
      }
    }
    
    if (controlsRef.current && !activeNode && !isEnteringVault) {
      controlsRef.current.update();
    }
  });
  return null;
};

export default function WelcomePage() {
  const router = useRouter();
  const [activeNode, setActiveNode] = useState<any>(null);
  const [isEnteringVault, setIsEnteringVault] = useState(false);
  const controlsRef = useRef<any>(null);

  // 🔥 PERFORMANCE TOGGLE STATE
  const [isSimpleMode, setIsSimpleMode] = useState(false);

  const handleLoginTransition = () => {
    playUI_SFX('warp'); 
    setActiveNode(null); 
    setIsEnteringVault(true); 
    setTimeout(() => {
      router.push('/login');
    }, 1500);
  };

  const closeNode = () => {
    playUI_SFX('close'); 
    setActiveNode(null);
  };

  return (
    <div className="w-full h-screen bg-[#000000] text-[#f5f5f7] font-sans relative overflow-hidden selection:bg-blue-500/30">
      
      {/* PERFORMANCE TOGGLE BUTTON (BOTTOM RIGHT) */}
      <button 
        onClick={() => {
          setIsSimpleMode(!isSimpleMode);
          setActiveNode(null); 
        }}
        className="absolute bottom-10 right-10 z-[100] px-5 py-3 bg-white/10 border border-white/20 hover:bg-white/20 rounded-full font-mono text-[10px] text-white uppercase tracking-widest transition-all backdrop-blur-xl flex items-center gap-3 pointer-events-auto shadow-2xl"
      >
        <div className={`w-2 h-2 rounded-full ${isSimpleMode ? 'bg-green-400 shadow-[0_0_10px_#4ade80]' : 'bg-[#0a84ff] animate-pulse shadow-[0_0_10px_#0a84ff]'}`} />
        {isSimpleMode ? "2D Mode Active" : "3D Engine Active"}
      </button>

      {/* Only show the 3D loader if we are actually loading 3D assets */}
      {!isSimpleMode && <TerminalLoader />}

      <div className={`absolute inset-0 z-0 ${isEnteringVault ? 'pointer-events-none' : ''}`}>
        {isSimpleMode ? (
          // 🔥 2D PERFORMANCE FALLBACK UI
          <div className="w-full h-full flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-black to-black animate-in fade-in duration-1000">
            <div className="w-3 h-3 rounded-full bg-[#0a84ff] shadow-[0_0_20px_rgba(10,132,255,1)] animate-pulse mb-6"></div>
            <h1 className="text-6xl font-bold tracking-tighter text-white mb-4 uppercase">Onyx Core</h1>
            <p className="text-[#a1a1a6] font-mono text-sm tracking-[0.2em] uppercase mb-12">Orbital Command // 2D Uplink Active</p>
            
            <button 
              onClick={handleLoginTransition} 
              className="group relative inline-flex items-center justify-center px-12 py-5 font-bold text-black bg-white rounded-xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] active:scale-95"
            >
              <span className="relative z-10 text-sm uppercase tracking-widest font-bold">Initiate Login Sequence</span>
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-gray-200/50 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
            </button>
          </div>
        ) : (
          // 🌎 ORIGINAL 3D ENGINE
          <Canvas dpr={[1, 1.5]} camera={{ position: [0, 2, 18], fov: 45 }}>
            <color attach="background" args={['#050505']} />
            <fog attach="fog" args={['#050505', 10, 40]} />
            
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={2} color="#ffffff" />
            <pointLight position={[0, 0, 0]} intensity={isEnteringVault ? 20 : 5} color={activeNode ? activeNode.color : "#0a84ff"} />

            <Suspense fallback={null}>
              <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.2}>
                <Station 
                  position={[0, -1, 0]} 
                  activeNodeId={activeNode?.id} 
                  onNodeSelect={(nodeData: any) => setActiveNode(nodeData)} 
                />
              </Float>
            </Suspense>

            <CameraRig activeNode={activeNode} isEnteringVault={isEnteringVault} controlsRef={controlsRef} />
            
            <OrbitControls 
              ref={controlsRef}
              enabled={!activeNode && !isEnteringVault} 
              maxDistance={100} 
              minDistance={3}   
              autoRotate={true} 
              autoRotateSpeed={0.5} 
              enablePan={true}  
              enableZoom={true} 
              makeDefault
            />

            <EffectComposer>
              <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} height={300} intensity={isEnteringVault ? 4.0 : 1.5} />
              <Vignette eskil={false} offset={0.1} darkness={1.1} />
            </EffectComposer>
          </Canvas>
        )}
      </div>

      {/* --- TRANSLUCENT INFO BARS (VISIBLE IN 2D & 3D) --- */}
      <div className={`hidden md:flex absolute top-1/2 -translate-y-1/2 left-10 z-40 flex-col gap-6 w-80 pointer-events-auto transition-all duration-700 delay-100 ${activeNode || isEnteringVault ? '-translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}>
        
        {/* Card 1: The AI */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-6 rounded-2xl shadow-[0_8px_32px_rgba(255,255,255,0.05)] hover:bg-white/20 hover:scale-[1.02] transition-all cursor-default group">
          <h3 className="text-[#0a84ff] font-mono text-[10px] font-bold tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#0a84ff] group-hover:animate-ping" /> The Engine
          </h3>
          <p className="text-gray-200 text-sm leading-relaxed">
            Onyx is a neuro-symbolic interview platform. We combine deterministic AST code parsing with probabilistic LLM orchestration for flawless FAANG-level evaluation.
          </p>
        </div>

        {/* Card 2: The Use Case */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-6 rounded-2xl shadow-[0_8px_32px_rgba(255,255,255,0.05)] hover:bg-white/20 hover:scale-[1.02] transition-all cursor-default group">
          <h3 className="text-[#a855f7] font-mono text-[10px] font-bold tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#a855f7] group-hover:animate-ping" /> The Gauntlet
          </h3>
          <p className="text-gray-200 text-sm leading-relaxed">
            Abandon static question banks. Onyx dynamically generates a 5-phase orbital curriculum perfectly mapped to your target enterprise and current skill tier.
          </p>
        </div>

        {/* Card 3: The Forge (Replaced Founders) */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-6 rounded-2xl shadow-[0_8px_32px_rgba(255,255,255,0.05)] hover:bg-white/20 hover:scale-[1.02] transition-all cursor-default group">
          <h3 className="text-[#22d3ee] font-mono text-[10px] font-bold tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22d3ee] group-hover:animate-ping" /> The Forge
          </h3>
          <p className="text-gray-200 text-sm leading-relaxed">
            Execute logic in our embedded Monaco IDE. Submit your code to the AST Grader to receive instantaneous, brutal Socratic feedback on your Time and Space complexity.
          </p>
        </div>

      </div>

      {/* TOP NAVIGATION & CONTROLS UI */}
      <div className={`transition-opacity duration-700 ${activeNode || isEnteringVault ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <nav className="absolute top-0 w-full z-50 px-8 py-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
          <div className="font-bold text-2xl tracking-tighter text-white flex items-center gap-3 ml-0">
            <div className="w-3 h-3 rounded-full bg-[#0a84ff] shadow-[0_0_15px_rgba(10,132,255,1)] animate-pulse hidden md:block"></div>
            <span>Onyx.</span> <span className="text-[#86868b] font-normal text-sm tracking-widest uppercase ml-2 hidden md:block">| Orbital Command</span>
          </div>
          <div className="flex gap-6 items-center pointer-events-auto">
            <button onClick={handleLoginTransition} className="text-sm font-mono tracking-widest uppercase text-[#86868b] hover:text-white transition-colors">
              Auth Sync
            </button>
            <button onClick={handleLoginTransition} className="bg-white/5 backdrop-blur-xl border border-white/10 text-white text-xs font-bold uppercase tracking-widest px-6 py-3 rounded-full hover:bg-[#0a84ff] hover:border-[#0a84ff] transition-all duration-500 shadow-[0_0_30px_rgba(255,255,255,0.05)] hover:shadow-[0_0_40px_rgba(10,132,255,0.4)]">
              Initialize Trajectory
            </button>
          </div>
        </nav>
        
        {/* Bottom controls hint (Hidden in 2D mode) */}
        {!isSimpleMode && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4 pointer-events-none">
            <div className="bg-black/40 backdrop-blur-md border border-white/10 px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 animate-bounce">
              <span className="text-xs font-mono uppercase tracking-[0.2em] text-[#a1a1a6] font-bold">
                Left Click: Rotate | Right Click: Pan | Scroll: Zoom
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ZOOMED IN SATELLITE UI */}
      {!isSimpleMode && (
        <div className={`absolute top-0 right-0 h-full w-full md:w-[450px] bg-black/40 backdrop-blur-3xl border-l border-white/10 p-10 flex flex-col justify-center transform transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 shadow-[0_0_100px_rgba(0,0,0,0.8)] ${(activeNode && !isEnteringVault) ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
          {activeNode && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-700 delay-300 fill-mode-both">
              <button onClick={closeNode} className="mb-12 w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 hover:rotate-90 transition-all duration-300">✕</button>
              <div className="text-xs font-mono tracking-[0.2em] uppercase mb-4" style={{ color: activeNode.color }}>{activeNode.subtitle}</div>
              <h2 className="text-4xl font-bold text-white tracking-tighter mb-8 leading-tight">{activeNode.title}</h2>
              <div className="w-full h-[1px] bg-gradient-to-r from-white/20 to-transparent mb-8"></div>
              <p className="text-[#a1a1a6] text-lg font-light leading-relaxed whitespace-pre-wrap">{activeNode.desc}</p>
              <button onClick={handleLoginTransition} className="mt-12 group relative inline-flex items-center justify-center w-full py-4 font-bold text-black bg-white rounded-xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] active:scale-95">
                <span className="relative z-10 text-sm uppercase tracking-widest font-bold">Initiate Login Sequence</span>
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-gray-200/50 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}