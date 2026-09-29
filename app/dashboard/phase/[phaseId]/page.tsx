'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  ChevronRight, 
  Play, 
  Target, 
  BookOpenText, 
  CodeXml, 
  Mic, 
  MicOff,
  Volume2, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Send 
} from 'lucide-react';
import Editor from '@monaco-editor/react';

import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Float, Center, Resize, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

import InterviewRoom from '@/app/components/InterviewRoom';
import AmazonAIAssessment from '@/app/components/AmazonAIAssessment';
import { getUserRoadmapAction, gradeAssignmentAction, saveCodeSubmissionAction } from '@/app/actions';

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

  useFrame((_, delta) => {
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
  const phaseId = (params?.phaseId as string) || '1';
  const theme = useMemo(() => PHASE_THEMES[phaseId] || PHASE_THEMES['1'], [phaseId]);
  const isSpecialPhase = phaseId === '99' || phaseId === '100';

  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const [phaseState, setPhaseState] = useState<'overview' | 'roadmap' | 'moduleDetail' | 'interview'>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [phaseData, setPhaseData] = useState<any>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  // Audio, Speech-to-Text & Comlink States
  const [isListening, setIsListening] = useState(false);
  const [isOnyxThinking, setIsOnyxThinking] = useState(false);
  const [isOnyxSpeaking, setIsOnyxSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<{ id: string; speaker: string; agent?: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Coding Assessment States
  const [dynamicQuestions, setDynamicQuestions] = useState<string[]>([]);
  const DEFAULT_COMMENT = "# Write your implementation here...\n";
  const [codeAnswers, setCodeAnswers] = useState<Record<number, string>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [isGrading, setIsGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<any>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [failedAttempts, setFailedAttempts] = useState<Record<number, number>>({});

  const glassClasses = `bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl`;
  const getDynamicGlow = (intensity: number) => `-${intensity}0px 0 100px -30px ${theme.colors.glow}`;

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Load Roadmap Data from DB
  useEffect(() => {
    async function loadData() {
      if (isSpecialPhase) {
        setPhaseData({
          summary: phaseId === '99' ? "Behavioral Analysis & Soft Skills Check." : "Final Technical Architecture Review.",
          targetCompany: "FAANG",
          learningGoals: phaseId === '99' ? ['Leadership Principles', 'Conflict Resolution'] : ['System Design', 'Scalability'],
          modules: []
        });
        setIsLoading(false);
        return;
      }

      const res = await getUserRoadmapAction("user_12345");
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

  // AUTO-LECTURE & SPLIT-PANE INITIALIZATION
  useEffect(() => {
    if (!currentModule || isSpecialPhase) return;

    setCurrentQuestionIdx(0);
    setGradeResult(null);
    setCodeAnswers({});
    setFailedAttempts({});

    // Parse the assignment prompts immediately so the right panel is ready
    const prompts = currentModule?.assignmentPrompt?.split('\n\n') || [
      "1. Implement the core architectural class discussed in the briefing.",
      "2. Optimize the method to guarantee O(N) runtime constraints."
    ];
    setDynamicQuestions(prompts);

    setTranscript([
      { id: 'sys1', speaker: 'System', text: `// Target Node: ${currentModule.chapterTitle}` },
      { id: 'sys2', speaker: 'System', text: `// Initializing Socratic Mentor...` }
    ]);

    const triggerOpeningLecture = async () => {
      setIsOnyxThinking(true);
      try {
        const res = await fetch("http://127.0.0.1:8000/api/lecture/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapter_title: currentModule.chapterTitle,
            study_material: currentModule.studyMaterial || currentModule.notes || "Let's master the core architecture."
          })
        });

        if (res.ok) {
          const data = await res.json();
          setTranscript(prev => [
            ...prev,
            { id: Date.now().toString(), speaker: "AI", agent: "Onyx Mentor", text: data.lecture_text }
          ]);

          if (data.audio_base64 && audioRef.current) {
            audioRef.current.src = `data:audio/wav;base64,${data.audio_base64}`;
            setIsOnyxSpeaking(true);
            audioRef.current.play().catch(() => setIsOnyxSpeaking(false));
          }
        }
      } catch (err) {
        console.error("Lecture start error:", err);
      } finally {
        setIsOnyxThinking(false);
      }
    };

    triggerOpeningLecture();
    setQuestionStartTime(Date.now());
  }, [selectedModuleId, currentModule, isSpecialPhase]);

  // SETUP SPEECH RECOGNITION (TRANSCRIBE TO INPUT BOX)
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true; 
    recognition.interimResults = true; 
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let transcriptBuilder = '';
      for (let i = 0; i < event.results.length; ++i) {
        transcriptBuilder += event.results[i][0].transcript;
      }
      setChatInput(transcriptBuilder);
    };

    recognition.onerror = (e: any) => {
      console.error("Microphone error:", e.error);
      setIsListening(false);
    };
    
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const toggleMicListening = () => {
    if (!recognitionRef.current) {
      alert("Microphone recognition is not supported in this browser. Please use Chrome/Edge.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      if (audioRef.current && isOnyxSpeaking) {
        audioRef.current.pause();
        setIsOnyxSpeaking(false);
      }
      try {
        setChatInput(""); 
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Could not start mic:", e);
      }
    }
  };

  // The master communication bridge to Diva
  const sendToHiveMind = async (text: string, isSystemTrigger: boolean = false) => {
    if (!text.trim()) return;

    if (!isSystemTrigger) {
      setTranscript(prev => [...prev, { id: Date.now().toString(), speaker: "User", text }]);
      setChatInput("");
    }
    setIsOnyxThinking(true);

    try {
      // We append the current live code to the prompt so Diva knows what the user is working on!
      const codeContext = codeAnswers[currentQuestionIdx] && codeAnswers[currentQuestionIdx] !== DEFAULT_COMMENT
        ? `\n\n[Live Editor Buffer]:\n${codeAnswers[currentQuestionIdx]}`
        : "";

      const response = await fetch("http://127.0.0.1:8000/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text + codeContext,
          module_context: currentModule ? `${currentModule.chapterTitle}: ${currentModule.notes}` : "General Engineering"
        })
      });

      if (!response.ok) throw new Error("Hive Mind offline");

      const data = await response.json();

      setTranscript(prev => [
        ...prev,
        { id: Date.now().toString(), speaker: "AI", agent: data.agent || "Onyx Core", text: data.ai_text }
      ]);

      setIsOnyxThinking(false);

      if (data.audio_base64 && audioRef.current) {
        audioRef.current.src = `data:audio/wav;base64,${data.audio_base64}`;
        setIsOnyxSpeaking(true);
        audioRef.current.play().catch(() => setIsOnyxSpeaking(false));
      }
    } catch (err: any) {
      setTranscript(prev => [...prev, { id: Date.now().toString(), speaker: "System", text: `[Transmission Failed]: ${err.message}` }]);
      setIsOnyxThinking(false);
      setIsOnyxSpeaking(false);
    }
  };

  const handleExecuteCode = async () => {
    const currentCode = codeAnswers[currentQuestionIdx] || DEFAULT_COMMENT;
    if (!currentCode.trim() || currentCode.trim() === DEFAULT_COMMENT.trim()) {
      alert("Write your solution before executing.");
      return;
    }

    setIsGrading(true);
    setGradeResult(null);
    const timeSpentSeconds = Math.floor((Date.now() - questionStartTime) / 1000);
    const currentAttempts = failedAttempts[currentQuestionIdx] || 0;

    try {
      const res = await gradeAssignmentAction(currentCode, dynamicQuestions[currentQuestionIdx], phaseData?.targetCompany || "FAANG");

      if (res.success && res.result) {
        setGradeResult(res.result);

        if (res.result.passed) {
          // 🎉 CODE PASSED
          setTranscript(prev => [...prev, { id: Date.now().toString(), speaker: "System", text: `[AST EVALUATION]: Optimization Passed. Score: ${res.result.score}/100.` }]);
          sendToHiveMind("I successfully optimized the code and passed the assignment tests!", true);

          if (currentQuestionIdx === dynamicQuestions.length - 1) {
            await saveCodeSubmissionAction(
              currentModule.sequenceIndex, currentCode, res.result.feedback,
              res.result.score, true, "user_12345",
              { attempts: currentAttempts + 1, timeSpentSeconds }
            );
            setTimeout(() => {
              alert(`NODE SECURED! Score: ${res.result.score}/100.`);
              setPhaseState('roadmap');
            }, 3000);
          } else {
            setTimeout(() => {
              setCurrentQuestionIdx(prev => prev + 1);
              setGradeResult(null);
            }, 3000);
          }
        } else {
          // ❌ CODE FAILED - Auto-trigger Diva to help!
          setFailedAttempts(prev => ({ ...prev, [currentQuestionIdx]: currentAttempts + 1 }));
          setTranscript(prev => [...prev, { id: Date.now().toString(), speaker: "System", text: `[AST EVALUATION FAILED]: ${res.result.feedback}` }]);
          
          // Send the failure directly to Diva so she speaks and gives a hint
          sendToHiveMind(`My code failed the AST evaluation with this error: ${res.result.feedback}. Can you give me a hint on how to optimize it?`, true);
        }
      }
    } catch {
      setGradeResult({ passed: false, score: 0, feedback: "Execution failed." });
    } finally {
      setIsGrading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-white">
        <Loader2 className="w-12 h-12 animate-spin mb-4" style={{ color: theme.colors.primary }} />
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black font-sans text-white overflow-hidden p-6 relative">
      <audio ref={audioRef} onEnded={() => setIsOnyxSpeaking(false)} className="hidden" />

      {/* 2D/3D Mode Toggle */}
      <button 
        onClick={() => setIsSimpleMode(!isSimpleMode)} 
        className="absolute top-6 left-6 z-50 px-4 py-2 bg-black/40 border border-white/10 hover:bg-white/10 rounded-full font-mono text-[10px] text-gray-300 uppercase tracking-widest transition-colors backdrop-blur-md flex items-center gap-2"
      >
        <div className={`w-2 h-2 rounded-full ${isSimpleMode ? 'bg-green-500' : 'bg-[#0a84ff] animate-pulse'}`} />
        {isSimpleMode ? "2D Active" : "3D Active"}
      </button>

      {/* 3D Background */}
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

      {/* STATE 1: OVERVIEW */}
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
            
            <h2 className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-4">{isSpecialPhase ? "Parameters:" : "Core Competencies:"}</h2>
            <div className="space-y-4 mb-10 flex-1 overflow-y-auto custom-scrollbar pr-2">
              {phaseData.learningGoals.map((goal: string, idx: number) => (
                <div key={idx} className="flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-xl">
                  <BookOpenText className="w-6 h-6 shrink-0" style={{ color: theme.colors.primary }} />
                  <span className="text-white text-sm font-medium">{goal}</span>
                </div>
              ))}
            </div>
            
            <button onClick={() => setPhaseState(isSpecialPhase ? 'interview' : 'roadmap')} className="w-full text-black p-5 rounded-xl font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 shrink-0" style={{ backgroundColor: theme.colors.accent, boxShadow: `0 0 30px ${theme.colors.glow}` }}>
              <Play className="w-5 h-5 fill-black" /> {isSpecialPhase ? "Commence Interrogation" : "Initiate Journey"}
            </button>
          </div>
        </div>
      )}

      {/* STATE 2: INTERVIEW */}
      {phaseState === 'interview' && isSpecialPhase && (
        phaseId === '99' ? (
          <AmazonAIAssessment onExit={() => setPhaseState('overview')} />
        ) : (
          <InterviewRoom 
            phaseId={phaseId} 
            phaseData={phaseData} 
            theme={theme} 
            isSimpleMode={isSimpleMode} 
            onExit={() => setPhaseState('overview')} 
          />
        )
      )}

      {/* STATE 3: ROADMAP NODES */}
      {!isSpecialPhase && phaseState === 'roadmap' && (
        <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-500 relative z-10">
          <div className="flex justify-center items-center gap-8 mb-16">
            <button onClick={() => setPhaseState('overview')} className="text-gray-400 hover:text-white transition-colors"><ChevronLeft size={32}/></button>
            <h1 className="text-4xl font-bold uppercase tracking-widest text-white">{theme.name} Nodes</h1>
          </div>
          <div className="flex justify-center gap-12 max-w-7xl w-full">
            {phaseData?.modules.map((module: any, idx: number) => (
              <div 
                key={module.id} 
                onClick={() => { 
                  if (module.status === 'LOCKED' && idx > 0) { 
                    alert("Clear previous node to unlock."); 
                    return; 
                  } 
                  setSelectedModuleId(module.id); 
                  setPhaseState('moduleDetail'); 
                }} 
                className={`${glassClasses} flex-1 p-8 text-center transition-all ${module.status === 'LOCKED' && idx > 0 ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer hover:scale-[1.03]'}`} 
                style={{ border: `1px solid ${theme.colors.primary}50`, boxShadow: `0 10px 40px -15px ${theme.colors.glow}` }}
              >
                <Target className="w-16 h-16 mx-auto mb-6" style={{ color: module.status === 'LOCKED' && idx > 0 ? '#666' : theme.colors.accent }} />
                <p className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-2">Node {module.sequenceIndex}</p>
                <h2 className="text-2xl font-bold uppercase tracking-tighter text-white mb-4 line-clamp-2">{module.chapterTitle}</h2>
                <div className="mt-6 flex items-center justify-center gap-2" style={{ color: module.status === 'LOCKED' && idx > 0 ? '#666' : theme.colors.primary }}>
                  {module.status === 'CLEARED' ? (
                    <span className="text-sm uppercase font-bold text-green-400">Node Secured</span>
                  ) : module.status === 'LOCKED' && idx > 0 ? (
                    <span className="text-sm uppercase font-bold text-red-400">Locked</span>
                  ) : (
                    <><Play size={16} fill={theme.colors.primary} /> <span className="text-sm uppercase font-semibold">Deploy Module</span></>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STATE 4: SIMULTANEOUS DUAL-PANE COMMAND CENTER */}
      {!isSpecialPhase && phaseState === 'moduleDetail' && currentModule && (
        <div className="w-full h-[calc(100vh-48px)] flex gap-6 animate-in fade-in slide-in-from-bottom-10 duration-700 relative z-10">
          
          {/* LEFT PANEL: Diva's Socratic Chat Interface */}
          <div className={`${glassClasses} w-[450px] flex flex-col overflow-hidden shrink-0`} style={{ borderLeft: `2px solid ${theme.colors.primary}`, boxShadow: getDynamicGlow(15) }}>
            
            {/* Header / Context */}
            <div className="p-6 border-b border-white/10 shrink-0 bg-gradient-to-b from-white/5 to-transparent">
              <button onClick={() => setPhaseState('roadmap')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-[10px] font-mono uppercase tracking-widest mb-4 w-fit">
                <ChevronLeft size={14} /> Return to Roadmap
              </button>
              <h2 className="text-xl font-bold uppercase tracking-tighter mb-2 text-white leading-tight">{currentModule.chapterTitle}</h2>
              <div className="flex items-center gap-3">
                {isOnyxSpeaking && (
                  <span className="flex items-center gap-2 text-[10px] font-mono text-purple-400 uppercase tracking-widest animate-pulse">
                    <Volume2 size={12} /> Live Audio
                  </span>
                )}
                {isOnyxThinking && (
                  <span className="flex items-center gap-2 text-[10px] font-mono text-blue-400 uppercase tracking-widest">
                    <Loader2 size={12} className="animate-spin" /> Diva is typing...
                  </span>
                )}
              </div>
            </div>

            {/* Chat Transcript Area */}
            <div className="flex-1 bg-[#050505] p-6 overflow-y-auto custom-scrollbar flex flex-col gap-5 shadow-inner">
              {transcript.map((msg) => (
                <div key={msg.id} className={`flex flex-col max-w-[90%] ${msg.speaker === 'User' ? 'self-end items-end' : 'self-start items-start'}`}>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-1">
                    {msg.speaker === 'User' ? 'You' : (msg.agent || 'Onyx Mentor')}
                  </span>
                  <div 
                    className={`px-4 py-3 text-sm leading-relaxed font-mono whitespace-pre-wrap ${
                      msg.speaker === 'System' 
                        ? 'text-red-400 italic bg-red-500/10 border border-red-500/20 rounded-xl' 
                        : msg.speaker === 'User' 
                          ? 'bg-white/10 text-white rounded-2xl rounded-tr-sm' 
                          : 'bg-transparent text-gray-200 border-l-2'
                    }`}
                    style={msg.speaker !== 'User' && msg.speaker !== 'System' ? { borderColor: theme.colors.accent } : {}}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>

            {/* Input & Mic Controller */}
            <div className="p-4 border-t border-white/10 bg-black/40 shrink-0">
              <div className="flex gap-2">
                <button 
                  onClick={toggleMicListening}
                  disabled={isOnyxThinking}
                  className={`flex items-center justify-center px-4 py-3 rounded-xl border transition-all ${
                    isListening 
                      ? 'bg-red-500 border-red-400 text-white animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                      : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendToHiveMind(chatInput)}
                  disabled={isOnyxThinking}
                  placeholder={isListening ? "Listening to your voice..." : "Ask Diva a question..."}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-white/30 font-mono placeholder:text-gray-600 disabled:opacity-50"
                />
                <button 
                  onClick={() => sendToHiveMind(chatInput)}
                  disabled={!chatInput.trim() || isOnyxThinking}
                  className="p-3 rounded-xl bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-30 flex items-center justify-center shrink-0"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Live Code Editor & Assessment */}
          <div className={`${glassClasses} flex-1 flex flex-col p-6 overflow-hidden relative min-w-0`} style={{ borderTop: `2px solid ${theme.colors.accent}`, boxShadow: getDynamicGlow(10) }}>
            
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <CodeXml className="w-5 h-5" style={{ color: theme.colors.primary }} />
                <span className="font-mono text-sm tracking-widest uppercase text-gray-300">The Crucible : Editor</span>
              </div>
              <div className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                Attempts: <span className="text-white">{failedAttempts[currentQuestionIdx] || 0}</span>
              </div>
            </div>

            {/* Objective Carousel */}
            {dynamicQuestions.length > 0 && (
              <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4 mb-4 shrink-0">
                <button onClick={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))} disabled={currentQuestionIdx === 0} className="p-2 text-gray-400 hover:text-white disabled:opacity-30"><ChevronLeft size={20} /></button>
                <div className="flex-1 px-4 text-center">
                  <span className="text-[10px] font-mono mb-1 block uppercase tracking-widest" style={{ color: theme.colors.primary }}>Objective {currentQuestionIdx + 1} of {dynamicQuestions.length}</span>
                  <p className="text-xs text-gray-200">{dynamicQuestions[currentQuestionIdx]}</p>
                </div>
                <button onClick={() => setCurrentQuestionIdx(prev => Math.min(dynamicQuestions.length - 1, prev + 1))} disabled={currentQuestionIdx === dynamicQuestions.length - 1} className="p-2 text-gray-400 hover:text-white disabled:opacity-30"><ChevronRight size={20} /></button>
              </div>
            )}

            {/* Monaco Editor */}
            <div className="w-full flex-1 min-h-[300px] bg-[#050505] border border-white/10 rounded-xl overflow-hidden relative shrink-0 mb-4">
              <Editor 
                height="100%" 
                defaultLanguage="python" 
                theme="vs-dark" 
                value={codeAnswers[currentQuestionIdx] || DEFAULT_COMMENT} 
                onChange={(value) => setCodeAnswers(prev => ({ ...prev, [currentQuestionIdx]: value || '' }))} 
                options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'JetBrains Mono, Menlo, monospace', padding: { top: 20, bottom: 20 } }} 
              />
            </div>

            {/* Grade Result */}
            {gradeResult && (
              <div className={`mb-4 p-4 rounded-xl border flex flex-col gap-2 ${gradeResult.passed ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {gradeResult.passed ? <CheckCircle size={16} className="text-green-500"/> : <XCircle size={16} className="text-red-500"/>}
                    <span className={`font-mono text-[10px] font-bold uppercase tracking-widest ${gradeResult.passed ? 'text-green-500' : 'text-red-500'}`}>{gradeResult.passed ? 'Objective Passed' : 'Optimization Failed'}</span>
                  </div>
                  <span className="font-mono text-[10px] text-gray-400">Score: {gradeResult.score}/100</span>
                </div>
                <p className="text-xs text-gray-300 mt-1">{gradeResult.feedback}</p>
              </div>
            )}

            {/* Submit Button */}
            <button 
              onClick={handleExecuteCode} 
              disabled={isGrading}
              className="w-full text-black py-3 rounded-xl font-bold uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3 shrink-0 disabled:opacity-70 text-[10px]" 
              style={{ backgroundColor: theme.colors.accent, boxShadow: `0 0 30px ${theme.colors.glow}` }}
            >
              {isGrading ? <Loader2 size={16} className="animate-spin text-black" /> : <Play size={16} className="fill-black" />} 
              {isGrading ? "Executing AST Analysis..." : "Submit Code to AST Engine"}
            </button>

          </div>
        </div>
      )}
    </div>
  );
}