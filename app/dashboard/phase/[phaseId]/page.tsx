'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Play, Target, BookOpenText, CodeXml, MessageSquare, Send, Loader2, CheckCircle, XCircle } from 'lucide-react';
import Editor from '@monaco-editor/react';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Stars, Float, Center, Resize } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

// 🔥 INJECTING THE NEW ISOLATED INTERVIEW ROOM COMPONENT
import InterviewRoom from '@/app/components/InterviewRoom';

// IMPORTED ACTIONS (Removed interview-specific actions since the InterviewRoom handles them now)
import { 
  getUserRoadmapAction, 
  getYouTubeVideoAction, 
  gradeAssignmentAction, 
  saveCodeSubmissionAction
} from '@/app/actions'; 

const PHASE_THEMES: { [key: string]: { name: string, model: string, colors: { primary: string, accent: string, glow: string } } } = {
  '1': { name: 'Fractured Earth', model: 'planet1.glb', colors: { primary: '#3b82f6', accent: '#ea580c', glow: 'rgba(234, 88, 12, 0.4)' } },
  '2': { name: 'Volcanic Forge', model: 'planet2.glb', colors: { primary: '#f97316', accent: '#ef4444', glow: 'rgba(249, 115, 22, 0.4)' } },
  '3': { name: 'Amethyst Core', model: 'planet3.glb', colors: { primary: '#a855f7', accent: '#f0abfc', glow: 'rgba(168, 85, 247, 0.4)' } },
  '4': { name: 'Aegis Halo', model: 'planet4.glb', colors: { primary: '#6366f1', accent: '#fbbf24', glow: 'rgba(99, 102, 241, 0.4)' } },
  '5': { name: 'Glacial Nexus', model: 'planet5.glb', colors: { primary: '#0f766e', accent: '#22d3ee', glow: 'rgba(34, 211, 238, 0.4)' } },
  '99': { name: 'HR Basecamp', model: 'moon.glb', colors: { primary: '#e2e8f0', accent: '#94a3b8', glow: 'rgba(226, 232, 240, 0.4)' } },
  '100': { name: 'The Core (Tech Boss)', model: 'sun.glb', colors: { primary: '#fbbf24', accent: '#ef4444', glow: 'rgba(251, 191, 36, 0.6)' } }
};

const CinematicPlanet = ({ theme }: { theme: any }) => {
  const { scene } = useGLTF(`/${theme.model}`) as any;
  const ref = useRef<THREE.Group>(null);
  const copiedScene = useMemo(() => scene.clone(), [scene, theme.model]);

  useFrame((state, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.1;
  });

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={1}>
      <group ref={ref} position={[-15, 0, -20]}>
        <Center><Resize scale={30}><primitive object={copiedScene} /></Resize></Center>
        <pointLight distance={150} intensity={80} color={theme.colors.primary} position={[10, 10, 10]} />
        <pointLight distance={100} intensity={40} color="#ffffff" position={[-10, -10, -10]} />
      </group>
    </Float>
  );
};

export default function PhasePage() {
  const router = useRouter();
  const params = useParams();
  const phaseId = params?.phaseId as string || '1'; 
  const theme = useMemo(() => PHASE_THEMES[phaseId] || PHASE_THEMES['1'], [phaseId]);
  
  const isSpecialPhase = phaseId === '99' || phaseId === '100';

  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const [phaseState, setPhaseState] = useState<'overview' | 'roadmap' | 'moduleDetail' | 'interview'>('overview');
  
  const [isLoading, setIsLoading] = useState(true);
  const [phaseData, setPhaseData] = useState<any>(null);
  
  // 🔥 STANDARD PHASE / FORGE STATES
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<'briefing' | 'chat'>('briefing');
  const [videoId, setVideoId] = useState<string | null>(null);
  const DEFAULT_COMMENT = "# Execute your logic here...\n";
  const [codeAnswers, setCodeAnswers] = useState<string[]>([DEFAULT_COMMENT, DEFAULT_COMMENT, DEFAULT_COMMENT]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [isGrading, setIsGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<any>(null);

  const glassClasses = `bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl`;
  const getDynamicGlow = (intensity: number) => `-${intensity}0px 0 100px -30px ${theme.colors.glow}`;

  useEffect(() => {
    async function loadData() {
      if (isSpecialPhase) {
        setPhaseData({
          summary: phaseId === '99' ? "Behavioral Analysis & Soft Skills Check. Prepare to justify your resume." : "Final Technical Architecture Review. O(N) constraints strictly enforced.",
          targetRole: "Software Engineer", 
          learningGoals: phaseId === '99' ? ['Leadership Principles', 'Conflict Resolution', 'Agile Methodologies'] : ['System Design', 'Scalability', 'Microservices'],
          modules: []
        });
        setIsLoading(false);
        return;
      }
      const mockUserId = "user_12345"; 
      const res = await getUserRoadmapAction(mockUserId);
      if (res.success && res.roadmap) {
        const pIdNum = parseInt(phaseId);
        const startIdx = (pIdNum - 1) * 3 + 1;
        const currentPhaseNodes = res.roadmap.nodes.filter((n: any) => n.sequenceIndex >= startIdx && n.sequenceIndex <= startIdx + 2);
        setPhaseData({
          summary: `Phase ${phaseId} of your ${res.roadmap.title} curriculum.`,
          targetCompany: res.roadmap.title,
          learningGoals: currentPhaseNodes.map((n: any) => n.chapterTitle),
          modules: currentPhaseNodes
        });
      }
      setIsLoading(false);
    }
    loadData();
  }, [phaseId, isSpecialPhase]);

  const currentModule = useMemo(() => {
    if (!phaseData || isSpecialPhase) return null;
    return phaseData.modules.find((m: any) => m.id === selectedModuleId);
  }, [selectedModuleId, phaseData, isSpecialPhase]);

  const questions = useMemo(() => {
    if (!currentModule || !currentModule.assignmentPrompt) return [];
    return currentModule.assignmentPrompt.split('\n\n').filter((p: string) => p.trim() !== "");
  }, [currentModule]);

  useEffect(() => {
    if (isSpecialPhase) return;
    setCurrentQuestionIdx(0);
    setGradeResult(null);
    setCodeAnswers([DEFAULT_COMMENT, DEFAULT_COMMENT, DEFAULT_COMMENT]);
  }, [selectedModuleId, isSpecialPhase]);

  useEffect(() => {
    async function fetchVideo() {
      if (currentModule && currentModule.youtubeSearchTerm) {
        setVideoId(null);
        const vidRes = await getYouTubeVideoAction(currentModule.youtubeSearchTerm);
        if (vidRes.success) setVideoId(vidRes.videoId);
      }
    }
    fetchVideo();
  }, [currentModule]);

  const handleExecuteCode = async () => {
    const currentCode = codeAnswers[currentQuestionIdx];
    if (!currentCode.trim() || currentCode.trim() === DEFAULT_COMMENT.trim()) { alert("Write some code first, engineer."); return; }
    setIsGrading(true);
    setGradeResult(null);

    try {
      const res = await gradeAssignmentAction(currentCode, questions[currentQuestionIdx], phaseData?.targetCompany || "FAANG");
      if (res.success && res.result) {
        setGradeResult(res.result);
        if (res.result.passed) {
          if (currentQuestionIdx === questions.length - 1) {
            const saveRes = await saveCodeSubmissionAction(currentModule.sequenceIndex, currentCode, res.result.feedback, res.result.score, true, "user_12345");
            if (saveRes.success) {
              setTimeout(() => { alert(`NODE SECURED! Score: ${res.result.score}/100.`); setPhaseState('roadmap'); }, 2000);
            }
          } else {
            setTimeout(() => { setCurrentQuestionIdx(prev => prev + 1); setGradeResult(null); }, 2500);
          }
        }
      } else setGradeResult({ passed: false, score: 0, feedback: "AST Parse Failure. Check syntax." });
    } catch (err) { setGradeResult({ passed: false, score: 0, feedback: "Critical system failure." });
    } finally { setIsGrading(false); }
  };

  if (isLoading) return <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-white"><Loader2 className="w-12 h-12 animate-spin mb-4" style={{ color: theme.colors.primary }} /></div>;

  return (
    <div className="w-full h-screen bg-black font-sans text-white overflow-hidden p-6 relative">
      
      <button onClick={() => setIsSimpleMode(!isSimpleMode)} className="absolute top-6 left-6 z-50 px-4 py-2 bg-black/40 border border-white/10 hover:bg-white/10 rounded-full font-mono text-[10px] text-gray-300 uppercase tracking-widest transition-colors backdrop-blur-md flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isSimpleMode ? 'bg-green-500' : 'bg-[#0a84ff] animate-pulse shadow-[0_0_10px_#0a84ff]'}`} />
        {isSimpleMode ? "2D Active" : "3D Active"}
      </button>

      {/* BACKGROUND FOR STANDARD PHASES (Hides entirely during interviews to save GPU) */}
      {(!isSpecialPhase || phaseState !== 'interview') && (
        <div className="absolute inset-0 z-0 opacity-80 pointer-events-none">
          {isSimpleMode ? (
            <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-black to-black" />
          ) : (
            <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 40], fov: 45 }}>
              <ambientLight intensity={1.5} />
              <directionalLight position={[0, 5, 10]} intensity={3} color="#ffffff" /> 
              <Stars radius={100} depth={50} count={2000} factor={3} fade speed={1} />
              <CinematicPlanet theme={theme} />
              <EffectComposer><Bloom luminanceThreshold={0.5} intensity={1.0} /></EffectComposer>
            </Canvas>
          )}
        </div>
      )}

      {/* STATE 1: PLANET/BOSS OVERVIEW */}
      {phaseState === 'overview' && (
        <div className="absolute inset-0 z-10 flex items-center justify-end p-16 pointer-events-none">
          <div className={`${glassClasses} w-[600px] h-full p-10 flex flex-col transition-all duration-700 pointer-events-auto`} style={{ borderLeft: `2px solid ${theme.colors.accent}`, boxShadow: getDynamicGlow(20) }}>
            <div className="flex justify-between items-center mb-8">
              <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-gray-400 font-mono text-xs uppercase tracking-widest hover:text-white"><ChevronLeft size={16} /> Return to Orbit</button>
              <div className="px-3 py-1 rounded-full font-mono text-xs font-bold uppercase tracking-widest border" style={{ color: theme.colors.accent, borderColor: theme.colors.accent, backgroundColor: `${theme.colors.accent}20` }}>
                {isSpecialPhase ? "RESTRICTED ACCESS" : `Phase 0${phaseId}`}
              </div>
            </div>
            <h1 className="text-5xl font-bold uppercase tracking-tighter mb-2">{theme.name}</h1>
            <p className="text-gray-400 mb-10 leading-relaxed">{phaseData.summary}</p>
            
            <h2 className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-4">{isSpecialPhase ? "Evaluation Parameters:" : "Core Competencies:"}</h2>
            <div className="space-y-4 mb-10 flex-1 overflow-y-auto custom-scrollbar pr-2">
              {phaseData.learningGoals.map((goal: string, idx: number) => (
                <div key={idx} className="flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-xl"><BookOpenText className="w-6 h-6 shrink-0" style={{ color: theme.colors.primary }} /><span className="text-white text-sm font-medium">{goal}</span></div>
              ))}
            </div>
            
            <button onClick={() => setPhaseState(isSpecialPhase ? 'interview' : 'roadmap')} className="w-full text-black p-5 rounded-xl font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 shrink-0" style={{ backgroundColor: theme.colors.accent, boxShadow: `0 0 30px ${theme.colors.glow}` }}>
              <Play className="w-5 h-5 fill-black" /> {isSpecialPhase ? "Commence Interrogation" : "Initiate Journey"}
            </button>
          </div>
        </div>
      )}

      {/* STATE 2: THE INTERVIEW ROOM (Now dynamically loaded from the new component!) */}
      {phaseState === 'interview' && isSpecialPhase && (
        <InterviewRoom 
          phaseId={phaseId} 
          phaseData={phaseData} 
          theme={theme} 
          isSimpleMode={isSimpleMode}
          onExit={() => setPhaseState('overview')} 
        />
      )}

      {/* STATES 3 & 4: THE FORGE (COMPLETELY UNTOUCHED) */}
      {!isSpecialPhase && phaseState === 'roadmap' && (
        <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-500 relative z-10">
          <div className="flex justify-center items-center gap-8 mb-16">
            <button onClick={() => setPhaseState('overview')} className="text-gray-400 hover:text-white transition-colors"><ChevronLeft size={32}/></button>
            <h1 className="text-4xl font-bold uppercase tracking-widest text-white">{theme.name} Nodes</h1>
          </div>
          <div className="flex justify-center gap-12 max-w-7xl w-full">
            {phaseData?.modules.map((module: any, idx: number) => (
              <div key={module.id} onClick={() => { if (module.status === 'LOCKED' && idx > 0) { alert("Clear previous node to unlock."); return; } setSelectedModuleId(module.id); setPhaseState('moduleDetail'); }} className={`${glassClasses} flex-1 p-8 text-center transition-all ${module.status === 'LOCKED' && idx > 0 ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer hover:scale-[1.03]'}`} style={{ border: `1px solid ${theme.colors.primary}50`, boxShadow: `0 10px 40px -15px ${theme.colors.glow}` }}>
                <Target className="w-16 h-16 mx-auto mb-6" style={{ color: module.status === 'LOCKED' && idx > 0 ? '#666' : theme.colors.accent }} />
                <p className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-2">Node {module.sequenceIndex}</p>
                <h2 className="text-2xl font-bold uppercase tracking-tighter text-white mb-4 line-clamp-2">{module.chapterTitle}</h2>
                <div className="mt-6 flex items-center justify-center gap-2" style={{ color: module.status === 'LOCKED' && idx > 0 ? '#666' : theme.colors.primary }}>
                  {module.status === 'CLEARED' ? <span className="text-sm uppercase font-bold text-green-400">Node Secured</span> : module.status === 'LOCKED' && idx > 0 ? <span className="text-sm uppercase font-bold text-red-400">Locked</span> : <><Play size={16} fill={theme.colors.primary} /> <span className="text-sm uppercase font-semibold">Deploy Module</span></>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isSpecialPhase && phaseState === 'moduleDetail' && currentModule && (
        <div className="w-full h-[calc(100vh-48px)] flex gap-6 animate-in fade-in slide-in-from-bottom-10 duration-700 relative z-10">
           <div className={`${glassClasses} w-[450px] flex flex-col p-6 shrink-0`} style={{ borderLeft: `2px solid ${theme.colors.primary}`, boxShadow: getDynamicGlow(15) }}>
             <button onClick={() => setPhaseState('roadmap')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest mb-6 w-fit"><ChevronLeft size={16} /> Return to Roadmap</button>

             <div className="flex gap-4 mb-6 border-b border-white/10 pb-2">
               <button onClick={() => setLeftTab('briefing')} className={`pb-2 px-2 border-b-2 font-mono text-xs uppercase tracking-widest transition-colors ${leftTab === 'briefing' ? 'text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`} style={{ borderColor: leftTab === 'briefing' ? theme.colors.accent : 'transparent' }}>Briefing</button>
               <button onClick={() => setLeftTab('chat')} className={`pb-2 px-2 border-b-2 font-mono text-xs uppercase tracking-widest transition-colors flex items-center gap-2 ${leftTab === 'chat' ? 'text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`} style={{ borderColor: leftTab === 'chat' ? theme.colors.accent : 'transparent' }}><MessageSquare size={14} /> AI Comlink</button>
             </div>

             {leftTab === 'briefing' && (
               <div className="flex flex-col flex-1 overflow-y-auto pr-2 custom-scrollbar">
                 <h2 className="text-3xl font-bold uppercase tracking-tighter mb-4 text-white leading-tight">{currentModule.chapterTitle}</h2>
                 <div className="w-full h-1 bg-white/10 rounded-full mb-6" style={{ backgroundColor: `${theme.colors.primary}30` }}><div className="w-1/3 h-full rounded-full" style={{ backgroundColor: theme.colors.accent }}></div></div>
                 <p className="text-gray-400 text-sm mb-8 leading-relaxed">{currentModule.notes}</p>
                 <div className="w-full aspect-video bg-[#050505] border border-white/10 rounded-xl flex flex-col items-center justify-center text-gray-500 mb-8 shadow-inner relative overflow-hidden shrink-0">
                   {videoId ? <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${videoId}`} title="YouTube video" frameBorder="0" allowFullScreen></iframe> : <div className="flex flex-col items-center"><Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color: theme.colors.accent }} /><span className="font-mono text-[10px] uppercase tracking-widest">Decrypting Transmission...</span></div>}
                 </div>
               </div>
             )}

             {leftTab === 'chat' && (
               <div className="flex flex-col flex-1 overflow-hidden">
                 <div className="flex-1 overflow-y-auto pr-2 space-y-4 mb-4 custom-scrollbar flex flex-col">
                   <div className="text-gray-500 text-sm font-mono text-center mt-10">AI Comlink Initialized...</div>
                 </div>
                 <form onSubmit={(e) => { e.preventDefault(); }} className="relative mt-auto shrink-0">
                   <input type="text" placeholder="Query the system..." className="w-full bg-[#050505] border border-white/10 rounded-xl py-4 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-white/30 transition-colors placeholder:text-gray-600" />
                   <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors"><Send size={18} /></button>
                 </form>
               </div>
             )}
           </div>

           <div className={`${glassClasses} flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar`} style={{ borderTop: `2px solid ${theme.colors.accent}`, boxShadow: getDynamicGlow(10) }}>
             
             <div className="flex items-center gap-3 mb-4 shrink-0">
               <CodeXml className="w-5 h-5" style={{ color: theme.colors.primary }} />
               <span className="font-mono text-sm tracking-widest uppercase text-gray-300">The Forge : main.py</span>
             </div>

             {questions.length > 0 && (
               <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4 mb-4 shrink-0">
                 <button onClick={() => { setCurrentQuestionIdx(prev => Math.max(0, prev - 1)); setGradeResult(null); }} disabled={currentQuestionIdx === 0} className="p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"><ChevronLeft size={20} /></button>
                 <div className="flex-1 px-4 text-center">
                    <span className="text-xs font-mono mb-2 block uppercase tracking-widest" style={{ color: theme.colors.primary }}>Objective 0{currentQuestionIdx + 1} of {questions.length}</span>
                    <p className="text-sm text-gray-200" dangerouslySetInnerHTML={{ __html: questions[currentQuestionIdx]?.replace(/(\*\*[^*]+\*\*)/g, "<span class='text-white font-bold'>$1</span>") }} />
                 </div>
                 <button onClick={() => { setCurrentQuestionIdx(prev => Math.min(questions.length - 1, prev + 1)); setGradeResult(null); }} disabled={currentQuestionIdx === questions.length - 1} className="p-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors"><ChevronRight size={20} /></button>
               </div>
             )}

             <div className="w-full flex-1 min-h-[400px] bg-[#050505] border border-white/10 rounded-xl flex items-center justify-center shadow-inner mb-4 overflow-hidden relative shrink-0">
                <Editor 
                  height="100%" 
                  defaultLanguage="python" 
                  theme="vs-dark" 
                  value={codeAnswers[currentQuestionIdx]} 
                  onChange={(value) => {
                    const newAnswers = [...codeAnswers];
                    newAnswers[currentQuestionIdx] = value || '';
                    setCodeAnswers(newAnswers);
                  }} 
                  options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: 'JetBrains Mono, Menlo, monospace', padding: { top: 24, bottom: 24 } }} 
                  loading={<Loader2 className="w-8 h-8 animate-spin" style={{ color: theme.colors.primary }} />} 
                />
             </div>

             {gradeResult && (
               <div className={`mb-4 p-4 rounded-xl border flex flex-col gap-2 animate-in slide-in-from-bottom-2 shrink-0 ${gradeResult.passed ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     {gradeResult.passed ? <CheckCircle size={18} className="text-green-500"/> : <XCircle size={18} className="text-red-500"/>}
                     <span className={`font-mono text-sm font-bold uppercase tracking-widest ${gradeResult.passed ? 'text-green-500' : 'text-red-500'}`}>{gradeResult.passed ? 'Execution Successful' : 'Compilation Failed'}</span>
                   </div>
                   <span className="font-mono text-xs text-gray-400 tracking-widest">Score: <span className="text-white">{gradeResult.score}/100</span></span>
                 </div>
                 <p className="text-sm text-gray-300 leading-relaxed mt-1">{gradeResult.feedback}</p>
                 {gradeResult.metrics && (
                    <div className="flex gap-6 mt-2 font-mono text-[10px] text-gray-400 uppercase tracking-widest border-t border-white/10 pt-2">
                      <span>Time: <span style={{ color: theme.colors.primary }}>{gradeResult.metrics.timeComplexity}</span></span>
                      <span>Space: <span style={{ color: theme.colors.primary }}>{gradeResult.metrics.spaceComplexity}</span></span>
                    </div>
                 )}
               </div>
             )}

             <button 
               onClick={handleExecuteCode} 
               disabled={isGrading}
               className="w-full text-black py-4 rounded-xl font-bold uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3 shrink-0 disabled:opacity-70 disabled:hover:scale-100" 
               style={{ backgroundColor: theme.colors.accent, boxShadow: `0 0 30px ${theme.colors.glow}` }}
             >
               {isGrading ? <Loader2 size={20} className="animate-spin text-black" /> : <Play size={20} className="fill-black" />} 
               {isGrading ? "Running AST..." : "Evaluate Code (Onyx AST)"}
             </button>
           </div>
        </div>
      )}
    </div>
  );
}