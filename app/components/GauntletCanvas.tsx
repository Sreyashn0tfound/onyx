'use client';

import * as THREE from 'three';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Sparkles, Float } from '@react-three/drei';
import { useRef, useMemo, Suspense, useState, useEffect } from 'react';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

// --- ENTERPRISE ANIMATED STONE & LIGHTNING SYSTEM ---
const AnimatedStone = ({ geometry, material, basePosition = [0, 0, 0], baseRotation = [0, 0, 0], baseScale = [1, 1, 1], isJustUnlocked, isUnlocked, targetIntensity, color }: any) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const timeRef = useRef(0);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    if (isJustUnlocked) {
      timeRef.current += delta;
      const t = timeRef.current;

      if (t < 0.8) {
        // Phase 1: Smooth Hover Drop (Easing)
        const startY = basePosition[1] + 1.5;
        const progress = Math.pow(t / 0.8, 3); // Cubic ease-in for a heavy slam
        meshRef.current.position.y = THREE.MathUtils.lerp(startY, basePosition[1], progress);
        material.emissiveIntensity = 20; // Blinding bright while falling
        if (lightRef.current) lightRef.current.intensity = 0;
      } 
      else if (t >= 0.8 && t < 3.5) {
        // Phase 2: THE LIGHTNING IMPACT
        meshRef.current.position.set(basePosition[0], basePosition[1], basePosition[2]);
        
        // Violent, chaotic flickering using high-frequency math
        const isSpike = Math.random() > 0.4;
        const flickerIntensity = isSpike ? (Math.random() * 40 + 10) : 0;
        
        // The metal reacts dynamically to this light
        if (lightRef.current) lightRef.current.intensity = flickerIntensity;
        material.emissiveIntensity = targetIntensity + flickerIntensity * 0.5;
      } 
      else {
        // Phase 3: Cooldown and stabilize
        if (lightRef.current) {
          lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, 0, 0.1);
        }
        material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, targetIntensity, 0.1);
      }
    } else {
      // Idle State
      meshRef.current.position.set(basePosition[0], basePosition[1], basePosition[2]);
      material.emissiveIntensity = isUnlocked ? targetIntensity : 0;
      if (lightRef.current) lightRef.current.intensity = 0;
      timeRef.current = 0;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} material={material} rotation={baseRotation} scale={baseScale} visible={isUnlocked || isJustUnlocked} />
      {/* Hidden light source that flashes to create the electricity reflection on the metal */}
      <pointLight ref={lightRef} position={basePosition} color={color} distance={4} decay={2} intensity={0} />
    </group>
  );
};


const Gauntlet = ({ unlockedIndex, ...props }: any) => {
  const { nodes } = useGLTF('/gauntlet.glb') as any;
  const meshRef = useRef<THREE.Group>(null);
  
  const [latestUnlocked, setLatestUnlocked] = useState(unlockedIndex);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (unlockedIndex > latestUnlocked) {
      setLatestUnlocked(unlockedIndex);
      setIsAnimating(true);
      // Let the impact sequence run for 4 seconds
      setTimeout(() => setIsAnimating(false), 4000);
    }
  }, [unlockedIndex, latestUnlocked]);

  // Clean, high-metalness PBR material
  const matteOnyx = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#0a0a0a",
    metalness: 0.95,
    roughness: 0.5, // Lowered roughness so the lightning reflects beautifully
    envMapIntensity: 0.5
  }), []);

  const stoneMaterials = useMemo(() => ({
    power: new THREE.MeshPhysicalMaterial({ color: "#6c35a8", emissive: "#bf5af2", transmission: 0.9, thickness: 0.5, roughness: 0.1 }),
    space: new THREE.MeshPhysicalMaterial({ color: "#165c9c", emissive: "#0a84ff", transmission: 0.9, thickness: 0.5, roughness: 0.1 }),
    reality: new THREE.MeshPhysicalMaterial({ color: "#9c1622", emissive: "#ff3b30", transmission: 0.9, thickness: 0.5, roughness: 0.1 }),
    soul: new THREE.MeshPhysicalMaterial({ color: "#9c5716", emissive: "#ff9f0a", transmission: 0.9, thickness: 0.5, roughness: 0.1 }),
    time: new THREE.MeshPhysicalMaterial({ color: "#169c3a", emissive: "#34c759", transmission: 0.9, thickness: 0.5, roughness: 0.1 }),
    mind: new THREE.MeshPhysicalMaterial({ color: "#9c8b16", emissive: "#ffd60a", transmission: 0.9, thickness: 0.5, roughness: 0.1 }),
  }), []);

  return (
    <group ref={meshRef} {...props} dispose={null}>
      {/* GAUNTLET METAL */}
      <group position={[-4.965, 6.231, -2.6]} rotation={[Math.PI / 2, -Math.PI / 2, 0]} scale={0.209}>
        <mesh geometry={nodes.polySurface22_fingers_0.geometry} material={matteOnyx} />
        <mesh geometry={nodes.polySurface23_fingers_0.geometry} material={matteOnyx} />
        <mesh geometry={nodes.polySurface24_fingers_0.geometry} material={matteOnyx} />
        <mesh geometry={nodes.polySurface25_fingers_0.geometry} material={matteOnyx} />
      </group>
      <mesh geometry={nodes.polySurface27_fingers_0.geometry} material={matteOnyx} position={[4.101, 0.491, 0.576]} />
      <mesh geometry={nodes.gauntlet_LowGroup9_Time_Stone_Plate_0.geometry} material={matteOnyx} />
      <mesh geometry={nodes.gauntlet_LowGroup12_Thumb_Part_0.geometry} material={matteOnyx} />
      <mesh geometry={nodes.pCylinder10_hand1_0.geometry} material={matteOnyx} />
      <mesh geometry={nodes.pCylinder18_wrist_hold_0.geometry} material={matteOnyx} />
      <mesh geometry={nodes.polySurface13_thumb_palm_0.geometry} material={matteOnyx} />
      <mesh geometry={nodes.polySurface32_palm_0.geometry} material={matteOnyx} />
      <mesh geometry={nodes.pCylinder24_handplate1_0.geometry} material={matteOnyx} />

      {/* STONES (Animated with exact coordinates) */}
      <AnimatedStone color="#bf5af2" geometry={nodes.gauntlet_LowpSphere5_Power_Stone_0.geometry} material={stoneMaterials.power} basePosition={[0, 0, 0]} isJustUnlocked={isAnimating && latestUnlocked === 1} isUnlocked={unlockedIndex >= 1} targetIntensity={5} />
      {unlockedIndex >= 1 && <Sparkles count={40} scale={0.5} color="#bf5af2" position={nodes.gauntlet_LowpSphere5_Power_Stone_0.position} size={2} speed={0.5} />}

      <AnimatedStone color="#0a84ff" geometry={nodes.gauntlet_LowpSphere4_Space_Stone_0.geometry} material={stoneMaterials.space} basePosition={[-0.295, -1.097, 0.317]} baseRotation={[0, 0.529, 0]} baseScale={[0.944, 1.129, 0.944]} isJustUnlocked={isAnimating && latestUnlocked === 2} isUnlocked={unlockedIndex >= 2} targetIntensity={6} />
      {unlockedIndex >= 2 && <Sparkles count={40} scale={0.5} color="#0a84ff" position={[-0.295, -1.097, 0.317]} size={2} speed={0.5} />}

      <AnimatedStone color="#ff3b30" geometry={nodes.gauntlet_LowpSphere3_Reality_Stone_0.geometry} material={stoneMaterials.reality} basePosition={[-0.41, -0.896, -0.057]} baseRotation={[0, 0.474, 0]} baseScale={[0.895, 1.111, 1]} isJustUnlocked={isAnimating && latestUnlocked === 3} isUnlocked={unlockedIndex >= 3} targetIntensity={6} />
      {unlockedIndex >= 3 && <Sparkles count={40} scale={0.5} color="#ff3b30" position={[-0.41, -0.896, -0.057]} size={2} speed={0.5} />}

      <AnimatedStone color="#ff9f0a" geometry={nodes.gauntlet_LowpSphere1_soul_stone_0.geometry} material={stoneMaterials.soul} basePosition={[0, 0, 0]} isJustUnlocked={isAnimating && latestUnlocked === 4} isUnlocked={unlockedIndex >= 4} targetIntensity={6} />
      {unlockedIndex >= 4 && <Sparkles count={40} scale={0.5} color="#ff9f0a" position={nodes.gauntlet_LowpSphere1_soul_stone_0.position} size={2} speed={0.5} />}

      <AnimatedStone color="#34c759" geometry={nodes.pSphere1_Time_Stone_0.geometry} material={stoneMaterials.time} basePosition={[0, 0, 0]} isJustUnlocked={isAnimating && latestUnlocked === 5} isUnlocked={unlockedIndex >= 5} targetIntensity={6} />
      {unlockedIndex >= 5 && <Sparkles count={40} scale={0.5} color="#34c759" position={nodes.pSphere1_Time_Stone_0.position} size={2} speed={0.5} />}

      <AnimatedStone color="#ffd60a" geometry={nodes.gauntlet_LowpSphere2_Mind_Stone_0.geometry} material={stoneMaterials.mind} basePosition={[0, 0, 0]} isJustUnlocked={isAnimating && latestUnlocked === 6} isUnlocked={unlockedIndex >= 6} targetIntensity={10} />
      {unlockedIndex >= 6 && <Sparkles count={100} scale={2} color="#ffd60a" position={nodes.gauntlet_LowpSphere2_Mind_Stone_0.position} size={3} speed={1} />}
    </group>
  );
};

const GauntletEnvironment = ({ unlockedIndex }: any) => {
  const stoneGlows = useMemo(() => {
    switch (unlockedIndex) {
      case 1: return { color: "#bf5af2", intensity: 5 }; 
      case 2: return { color: "#0a84ff", intensity: 10 }; 
      case 3: return { color: "#ff3b30", intensity: 15 }; 
      case 4: return { color: "#ff9f0a", intensity: 20 }; 
      case 5: return { color: "#34c759", intensity: 25 }; 
      case 6: return { color: "#ffd60a", intensity: 35 }; 
      default: return { color: "#0071e3", intensity: 2 }; 
    }
  }, [unlockedIndex]);

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={stoneGlows.intensity} color={stoneGlows.color} />
      <Sparkles count={150} scale={[15, 15, 15]} size={1.5} color={stoneGlows.color} speed={0.1} />
      
      <EffectComposer>
        <Bloom luminanceThreshold={0.6} luminanceSmoothing={0.9} height={300} intensity={2.0} />
      </EffectComposer>
    </>
  );
};

export default function GauntletCanvas({ unlockedIndex }: { unlockedIndex: number }) {
  const safeIndex = unlockedIndex || 0;

  return (
    <div className="w-full h-[600px] bg-[#0a0a0a]/40 rounded-[3rem] border border-white/10 relative overflow-hidden animate-in fade-in duration-1000 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
      <Suspense fallback={<div className="text-[#86868b] flex h-full items-center justify-center tracking-widest uppercase font-bold text-sm font-mono animate-pulse">Initializing 3D Vector Map...</div>}>
        <Canvas camera={{ position: [0, 0, 14], fov: 45 }}>
          <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
            <Gauntlet unlockedIndex={safeIndex} position={[0, -4.5, 0]} rotation={[0, -Math.PI / 4, 0]} scale={0.8} />
          </Float>
          <GauntletEnvironment unlockedIndex={safeIndex} />
          <OrbitControls enableZoom={false} enablePan={false} autoRotate={safeIndex >= 6} autoRotateSpeed={2} minPolarAngle={Math.PI / 3} maxPolarAngle={Math.PI / 1.5} />
        </Canvas>
      </Suspense>
      
      <div className="absolute bottom-6 left-6 flex items-center gap-3 bg-black/60 px-5 py-2.5 rounded-full border border-white/10 backdrop-blur-md shadow-lg font-mono z-10">
        <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${safeIndex >= 6 ? 'bg-[#ffd60a]' : 'bg-[#0071e3]'}`}></div>
        <span className="text-xs text-white uppercase tracking-widest font-bold">
          Onyx Sync: {Math.min(safeIndex, 6)}/6 Phases Secured
        </span>
      </div>
    </div>
  );
}