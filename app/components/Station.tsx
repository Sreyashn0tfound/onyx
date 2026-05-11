'use client';

import * as THREE from 'three';
import React, { useEffect, useState, useRef } from 'react';
import { useGLTF, useAnimations, Clone, Float } from '@react-three/drei';

const SatelliteNode = ({ position, color, onClick }: any) => {
  const { scene } = useGLTF('/satellite.glb') as any;
  const ref = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : 'auto';
    return () => { document.body.style.cursor = 'auto'; };
  }, [hovered]);

  return (
    <group position={position}>
      <mesh 
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
      >
        <sphereGeometry args={[1.5, 16, 16]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      
      <Float speed={3} rotationIntensity={0.8} floatIntensity={0.6}>
        <group ref={ref} scale={hovered ? 1.3 : 1.0} rotation={[0, Date.now() * 0.0005, 0]}>
          <Clone object={scene} scale={0.4} /> 
          <pointLight color={color} intensity={hovered ? 8 : 2} distance={5} />
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshBasicMaterial color={color} transparent opacity={hovered ? 0.9 : 0.4} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      </Float>
    </group>
  );
};

export function Station({ onNodeSelect, ...props }: any) {
  const group = React.useRef<THREE.Group>(null);
  const { nodes, materials, animations } = useGLTF('/station.glb') as any;
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    if (actions['Animation']) actions['Animation'].play();
  }, [actions]);

  // Expanded to 6 Satellites
  const intelNodes = [
    {
      id: 'core', color: '#0a84ff', pos: [5, 2.5, 1], camPos: [8, 3.5, 5], lookAt: [5, 2.5, 1],
      title: "The Onyx Engine", subtitle: "SECTOR 01 // CORE DIRECTIVE",
      desc: "An enterprise-grade technical calibration platform. We don't do standard tutorials. We extract your ATS telemetry, execute algorithmic stress tests in our AST terminal, and simulate real-time engineering comms to forge a FAANG-grade profile."
    },
    {
      id: 'arsenal', color: '#bf5af2', pos: [-3, 1, 4], camPos: [-6, 2, 8], lookAt: [-3, 1, 4],
      title: "Technical Arsenal", subtitle: "SECTOR 02 // SYSTEMS DEPLOYED",
      desc: "• AST Grader: Real-time Big-O complexity analysis.\n• ATS Telemetry: Browser-level PDF resume extraction.\n• Comm Lab: Voice-driven HR and technical simulations."
    },
    {
      id: 'roster', color: '#34c759', pos: [0, -5, -3], camPos: [0, -7, 2], lookAt: [0, -5, -3],
      title: "Command Roster", subtitle: "SECTOR 03 // ONYX ENGINEERING",
      desc: "LEAD ARCHITECT: Shreyes Simha\nWEBAPP INFRA: Sujan Gowda\nQA TELEMETRY: Pratyush C.M\nGROWTH LEAD: Atharv Bhardwaj"
    },
    // --- NEW EMPTY SATELLITES ---
    {
      id: 'empty1', color: '#ff9f0a', pos: [6, -3, -4], camPos: [9, -4, 0], lookAt: [6, -3, -4],
      title: "Encrypted Archive", subtitle: "SECTOR 04 // RESTRICTED",
      desc: "Awaiting decryption sequence... Drop your future app info here."
    },
    {
      id: 'empty2', color: '#ff3b30', pos: [-5, -4, -2], camPos: [-8, -5, 2], lookAt: [-5, -4, -2],
      title: "Classified Node", subtitle: "SECTOR 05 // RESTRICTED",
      desc: "Awaiting decryption sequence... Drop your future app info here."
    },
    {
      id: 'empty3', color: '#ffd60a', pos: [2, 6, -3], camPos: [4, 8, 1], lookAt: [2, 6, -3],
      title: "System Telemetry", subtitle: "SECTOR 06 // RESTRICTED",
      desc: "Awaiting decryption sequence... Drop your future app info here."
    }
  ];

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_model" rotation={[-2.044, -0.213, -0.061]} scale={2.701}>
        <group name="GLTF_SceneRootNode" rotation={[Math.PI / 2, 0, 0]}>
          <group name="SpaceStation_low_0"><mesh name="Object_4" geometry={nodes.Object_4.geometry} material={materials.spacestation_main2} /></group>
          <group name="SpaceStation001_low_1"><mesh name="Object_6" geometry={nodes.Object_6.geometry} material={materials.spacestation_smalllights} /></group>
          <group name="SpaceStation002_low_2"><mesh name="Object_8" geometry={nodes.Object_8.geometry} material={materials.spacestation_main2} /></group>
          <group name="SpaceStation003_low_3"><mesh name="Object_10" geometry={nodes.Object_10.geometry} material={materials.spacestation_main2} /></group>
          <group name="SpaceStation004_low_4"><mesh name="Object_12" geometry={nodes.Object_12.geometry} material={materials.spacestation_main} /></group>
          <group name="SpaceStation005_low_5"><mesh name="Object_14" geometry={nodes.Object_14.geometry} material={materials.spacestation_main} /></group>
          <group name="SpaceStation006_low_6" rotation={[Math.PI, -0.545, Math.PI]}><mesh name="Object_16" geometry={nodes.Object_16.geometry} material={materials.spacestation_main} /></group>
          <group name="SpaceStation007_low_7"><mesh name="Object_18" geometry={nodes.Object_18.geometry} material={materials.spacestation_main} /></group>
        </group>
      </group>

      {intelNodes.map((node) => (
        <SatelliteNode key={node.id} position={node.pos} color={node.color} onClick={() => onNodeSelect(node)} />
      ))}
    </group>
  );
}

useGLTF.preload('/station.glb');
useGLTF.preload('/satellite.glb');