'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars, Float } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useRef, useState, Suspense } from 'react';

// --- NEW AUTH IMPORTS ---
import { signIn } from 'next-auth/react';
import { signUpAction } from '@/app/actions';

// --- INSTANT-LOAD 3D BACKGROUND: THE CREATION CORE ---
const CreationCore = () => {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (ring1.current) {
      ring1.current.rotation.x += delta * 0.15;
      ring1.current.rotation.y += delta * 0.2;
    }
    if (ring2.current) {
      ring2.current.rotation.x -= delta * 0.2;
      ring2.current.rotation.y -= delta * 0.3;
    }
    if (core.current) {
      core.current.rotation.y += delta * 0.1;
      core.current.rotation.z += delta * 0.05;
    }
  });

  return (
    // Positioned to the left to balance the heavy UI panel on the right
    <group position={[-3, 0, -2]} scale={1.2}>
      {/* Outer Data Ring */}
      <mesh ref={ring1}>
        <torusGeometry args={[3.5, 0.02, 64, 100]} />
        <meshBasicMaterial color="#bf5af2" transparent opacity={0.3} />
      </mesh>
      {/* Inner Energy Wireframe */}
      <mesh ref={ring2} scale={0.9}>
        <torusGeometry args={[3, 0.05, 16, 100]} />
        <meshBasicMaterial color="#0a84ff" wireframe transparent opacity={0.4} />
      </mesh>
      {/* The Central Geometric Core */}
      <mesh ref={core}>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.15} />
      </mesh>
      {/* Core Glow */}
      <pointLight color="#bf5af2" intensity={15} distance={10} />
      <pointLight color="#0a84ff" intensity={10} distance={5} />
    </group>
  );
};

export default function SignupPage() {
  const router = useRouter();
  
  // --- FORM STATES ---
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // --- AUTH.JS STATES ---
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    // 1. Basic Validation
    if (password !== confirmPassword) {
      setError("Encryption keys do not match. Verify your input.");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Encryption key must be at least 6 characters.");
      setIsLoading(false);
      return;
    }

    // 2. Execute Auth.js Manual Signup Action
    const formData = new FormData();
    formData.append('email', email);
    formData.append('password', password);
    formData.append('fullName', fullName);

    const res = await signUpAction(formData);

    if (!res.success) {
      setError(res.error || "Profile initialization failed.");
      setIsLoading(false);
    } else {
      // 3. SUCCESS! Auto-login the user immediately using Auth.js
      setSuccess("Profile forged. Initiating automatic uplink...");
      
      const signInRes = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (signInRes?.error) {
        // Fallback if auto-login bugs out
        setTimeout(() => router.push('/login'), 1500);
      } else {
        // Brand new profile, force intake state, and blast to dashboard
        sessionStorage.setItem('onyx_appState', 'intake');
        router.push('/dashboard');
      }
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#000000] text-[#f5f5f7] font-sans relative overflow-hidden selection:bg-purple-500/30 flex items-center justify-center py-10">
      
      {/* --- WEBGL BACKGROUND --- */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
          <color attach="background" args={['#020202']} />
          <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={2} />
          
          <ambientLight intensity={0.5} />
          <Suspense fallback={null}>
            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
              <CreationCore />
            </Float>
          </Suspense>

          <EffectComposer>
            <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={1.5} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* --- THE GLASSMORPHIC TERMINAL --- */}
      <div className="relative z-10 w-full max-w-md px-6 md:ml-auto md:mr-[10%] animate-in fade-in slide-in-from-right-8 duration-1000">
        
        <div className="flex flex-col mb-8 text-left">
          <div className="w-12 h-12 rounded-full bg-black/50 border border-white/10 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(191,90,242,0.3)]">
            <div className="w-3 h-3 bg-[#bf5af2] rounded-full animate-pulse shadow-[0_0_15px_rgba(191,90,242,1)]"></div>
          </div>
          <h1 className="text-4xl font-bold tracking-tighter text-white mb-2">Initialize Profile</h1>
          <p className="text-xs font-mono tracking-widest uppercase text-[#86868b]">
            Establish your telemetry vector.
          </p>
        </div>

        <div className="bg-[#0a0a0a]/60 backdrop-blur-3xl border border-white/10 p-8 rounded-[2rem] shadow-2xl">
          
          {/* AUTH ERRORS */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 animate-in fade-in">
              <span className="text-red-500 text-sm">⚠️</span>
              <p className="text-xs font-mono tracking-widest text-red-400 uppercase leading-relaxed">{error}</p>
            </div>
          )}

          {/* AUTH SUCCESS (Uplink Transition) */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center gap-3 animate-in fade-in">
              <span className="text-green-500 text-sm">✓</span>
              <p className="text-xs font-mono tracking-widest text-green-400 uppercase leading-relaxed">{success}</p>
            </div>
          )}

          <form className="flex flex-col gap-5" onSubmit={handleSignup}>
            
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-mono tracking-widest text-[#a1a1a6] uppercase ml-2">Designation (Full Name)</label>
              <input 
                type="text" 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={isLoading || !!success}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bf5af2] focus:ring-1 focus:ring-[#bf5af2] transition-all placeholder:text-white/20 disabled:opacity-50"
                placeholder="John Doe"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-mono tracking-widest text-[#a1a1a6] uppercase ml-2">Auth Sync ID (Email)</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading || !!success}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bf5af2] focus:ring-1 focus:ring-[#bf5af2] transition-all placeholder:text-white/20 disabled:opacity-50"
                placeholder="engineer@faang.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono tracking-widest text-[#a1a1a6] uppercase ml-2">Encryption Key</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading || !!success}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bf5af2] focus:ring-1 focus:ring-[#bf5af2] transition-all placeholder:text-white/20 disabled:opacity-50"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono tracking-widest text-[#a1a1a6] uppercase ml-2">Verify Key</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading || !!success}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#bf5af2] focus:ring-1 focus:ring-[#bf5af2] transition-all placeholder:text-white/20 disabled:opacity-50"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={isLoading || !!success}
              className="mt-6 group relative inline-flex items-center justify-center w-full py-4 font-bold text-black bg-white rounded-xl overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] active:scale-95 disabled:opacity-70 disabled:hover:scale-100 disabled:cursor-not-allowed"
            >
              <span className="relative z-10 text-sm uppercase tracking-widest font-bold">
                {isLoading ? 'Forging Profile...' : 'Execute Initialization'}
              </span>
              {!isLoading && !success && (
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-gray-200/50 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-[#86868b] text-xs font-light">
              Already have clearance? <Link href="/login" className="text-white hover:text-[#bf5af2] font-semibold transition-colors">Access Vault</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}