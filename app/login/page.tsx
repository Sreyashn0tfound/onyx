'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Float, useGLTF, Clone } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useRef, useState, Suspense } from 'react';

// --- NEW AUTH IMPORT ---
import { signIn } from 'next-auth/react';
import { checkUserRoadmapAction } from '@/app/actions';

// --- DRIFTING BACKGROUND SATELLITE ---
const DriftingSatellite = () => {
  const { scene } = useGLTF('/satellite.glb') as any;
  const ref = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.1;
      ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    }
  });

  return (
    <group ref={ref} position={[3, 0, -2]} scale={1.5} rotation={[0.2, 0, -0.2]}>
      <Clone object={scene} />
      <pointLight color="#0a84ff" intensity={8} distance={15} />
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshBasicMaterial color="#0a84ff" transparent opacity={0.6} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // --- AUTH.JS STATES ---
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Attempt to authenticate using Auth.js Credentials Provider
    const res = await signIn('credentials', {
      redirect: false,
      email,
      password,
    });

    if (res?.error) {
      // Auth failed
      setError("Invalid credentials. Please verify your Auth Sync ID and Encryption Key.");
      setIsLoading(false);
    } else {
      // Auth success! Check for an existing roadmap before routing
      const sessionRes = await fetch('/api/auth/session');
      const sessionData = await sessionRes.json();
      
      if (sessionData?.user?.id) {
        const check = await checkUserRoadmapAction(sessionData.user.id);
        if (check.hasRoadmap) {
          sessionStorage.setItem('onyx_appState', 'map');
        } else {
          sessionStorage.setItem('onyx_appState', 'intake');
        }
      }

      router.push('/dashboard');
    }
  };

  return (
    <div className="w-full h-screen bg-[#000000] text-[#f5f5f7] font-sans relative overflow-hidden selection:bg-purple-500/30 flex items-center justify-center">
      
      {/* --- WEBGL BACKGROUND --- */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
          <color attach="background" args={['#020202']} />
          <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={2} />
          
          <ambientLight intensity={0.5} />
          <directionalLight position={[-10, 10, 5]} intensity={1} color="#ffffff" />

          <Suspense fallback={null}>
            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
              <DriftingSatellite />
            </Float>
          </Suspense>

          <EffectComposer>
            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={1.5} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* --- THE GLASSMORPHIC TERMINAL --- */}
      <div className="relative z-10 w-full max-w-md px-6 md:mr-auto md:ml-[15%] animate-in fade-in slide-in-from-left-8 duration-1000">
        
        <div className="flex flex-col mb-10 text-left">
          <div className="w-12 h-12 rounded-full bg-black/50 border border-white/10 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(10,132,255,0.3)]">
            <div className="w-3 h-3 bg-[#0a84ff] rounded-full animate-pulse shadow-[0_0_15px_rgba(10,132,255,1)]"></div>
          </div>
          <h1 className="text-4xl font-bold tracking-tighter text-white mb-2">Vault Access</h1>
          <p className="text-xs font-mono tracking-widest uppercase text-[#86868b]">
            Establish identity to secure the node.
          </p>
        </div>

        <div className="bg-[#0a0a0a]/60 backdrop-blur-3xl border border-white/10 p-8 rounded-[2rem] shadow-2xl">
          
          {/* DISPLAY AUTH.JS ERRORS HERE */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 animate-in fade-in">
              <span className="text-red-500 text-sm">⚠️</span>
              <p className="text-xs font-mono tracking-widest text-red-400 uppercase">{error}</p>
            </div>
          )}

          <form className="flex flex-col gap-6" onSubmit={handleLogin}>
            
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-mono tracking-widest text-[#a1a1a6] uppercase ml-2">Auth Sync ID (Email)</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#0a84ff] focus:ring-1 focus:ring-[#0a84ff] transition-all placeholder:text-white/20 disabled:opacity-50"
                placeholder="engineer@faang.com"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-mono tracking-widest text-[#a1a1a6] uppercase ml-2">Encryption Key (Password)</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#0a84ff] focus:ring-1 focus:ring-[#0a84ff] transition-all placeholder:text-white/20 disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="mt-4 group relative inline-flex items-center justify-center w-full py-4 font-bold text-black bg-white rounded-xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] active:scale-95 disabled:opacity-70 disabled:hover:scale-100 disabled:cursor-not-allowed"
            >
              <span className="relative z-10 text-sm uppercase tracking-widest font-bold">
                {isLoading ? 'Decrypting...' : 'Decrypt & Enter'}
              </span>
              {!isLoading && (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-gray-200/50 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-[#86868b] text-xs font-light">
              Don&apos;t have clearance? <Link href="/signup" className="text-white hover:text-[#0a84ff] font-semibold transition-colors">Request Access</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

useGLTF.preload('/satellite.glb');