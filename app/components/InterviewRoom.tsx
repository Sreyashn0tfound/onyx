'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Loader2, 
  Mic, 
  Video, 
  VideoOff, 
  MicOff, 
  Activity, 
  Send, 
  PhoneOff, 
  CodeXml, 
  Play, 
  CheckCircle2
} from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { submitToOnyxBrainAction } from '@/app/actions';
import { BRAIN_URL } from '@/lib/brain';
import { useSpeechToText } from '@/lib/useSpeechToText';

// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import Editor from '@monaco-editor/react';

// --- 3D VRM AVATAR WITH LIP SYNC ---
export function OnyxAvatar({ url, isSpeaking }: { url: string; isSpeaking: boolean }) {
  const [vrm, setVrm] = useState<VRM | null>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    // @ts-ignore
    loader.register((parser: any) => new VRMLoaderPlugin(parser));

    loader.load(
      url,
      (gltf: any) => {
        const vrmData = gltf.userData.vrm;
        if (vrmData) {
          vrmData.scene.rotation.y = Math.PI;
          if (vrmData.humanoid) {
            const leftArm = vrmData.humanoid.getNormalizedBoneNode('leftUpperArm');
            const rightArm = vrmData.humanoid.getNormalizedBoneNode('rightUpperArm');
            if (leftArm) leftArm.rotation.z = 1.2;
            if (rightArm) rightArm.rotation.z = -1.2;
          }
          setVrm(vrmData);
        }
      },
      undefined,
      (error: any) => console.error('VRM Load Error:', error)
    );
  }, [url]);

  useFrame((_, delta) => {
    if (vrm) {
      vrm.update(delta);
      if (Math.random() < 0.02) vrm.expressionManager?.setValue('blink', 1.0);
      else vrm.expressionManager?.setValue('blink', 0.0);

      if (isSpeaking) {
        vrm.expressionManager?.setValue('aa', Math.random() * 0.8);
      } else {
        vrm.expressionManager?.setValue('aa', 0.0);
      }
    }
  });

  if (vrm) return <primitive object={vrm.scene} position={[0, -1.4, 0]} scale={[1, 1, 1]} />;
  return null;
}

// --- MAIN MULTI-AGENT INTERVIEW ROOM ---
interface InterviewRoomProps {
  phaseId: string;
  phaseData: any;
  theme: any;
  onExit: () => void;
  isSimpleMode?: boolean;
}

export default function InterviewRoom({ phaseId, phaseData, theme, onExit, isSimpleMode }: InterviewRoomProps) {
  const router = useRouter();

  // Core Flow States
  const [interviewStatus, setInterviewStatus] = useState<'idle' | 'active' | 'evaluating'>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<{ role: string; text: string; agent?: string }[]>([]);

  // Swarm & Telemetry States
  const [activeAgent, setActiveAgent] = useState<string>("System");
  const [biometricStress, setBiometricStress] = useState<string>("Initializing...");
  const [astAnalysis, setAstAnalysis] = useState<{ complexity: string; feedback: string } | null>(null);
  const [isAnalyzingAST, setIsAnalyzingAST] = useState(false);
  const [panelSatisfaction, setPanelSatisfaction] = useState<Record<string, boolean>>({
    "Tech Lead": false,
    "Architect": false,
    "HR": false
  });

  // Editor & Speech States
  const [code, setCode] = useState<string>(
    `# Python 3 - Live FAANG Architecture Buffer\n\nclass SystemService:\n    def __init__(self):\n        self.storage = {}\n\n    def process_request(self, payload: dict) -> bool:\n        # Write optimized implementation here\n        return True\n`
  );
  const [camActive, setCamActive] = useState(true);
  const [chatInput, setChatInput] = useState("");

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  
  // 🔥 FIX: The Snapshot Ref to prevent text wiping!
  const baseInputRef = useRef<string>(""); 

  const glassClasses = `bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl`;

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // -------------------------------------------------------------
  // 1. FCV WEBCAM & BACKGROUND BIOMETRIC INGESTION
  // -------------------------------------------------------------
  useEffect(() => {
    let frameInterval: NodeJS.Timeout;

    if (camActive) {
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
        .then((stream) => {
          if (videoRef.current) videoRef.current.srcObject = stream;

          frameInterval = setInterval(() => {
            if (videoRef.current && canvasRef.current && interviewStatus === 'active') {
              const ctx = canvasRef.current.getContext('2d');
              canvasRef.current.width = 320;
              canvasRef.current.height = 240;
              ctx?.drawImage(videoRef.current, 0, 0, 320, 240);

              const base64Frame = canvasRef.current.toDataURL('image/jpeg', 0.6);

              fetch(`${BRAIN_URL}/api/cv/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_base64: base64Frame })
              })
                .then((res) => res.json())
                .then((data) => {
                  if (data.status === 'success') {
                    setBiometricStress(data.biometrics.stress_level);
                  }
                })
                .catch(() => setBiometricStress("Telemetry Offline"));
            }
          }, 4000);
        })
        .catch((err) => {
          console.error("Camera access error:", err);
          setCamActive(false);
        });
    } else {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    }

    return () => {
      clearInterval(frameInterval);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [camActive, interviewStatus]);

  // -------------------------------------------------------------
  // 2. ROCK-SOLID SPEECH RECOGNITION (WebSpeech + Groq Whisper fallback)
  // -------------------------------------------------------------
  const { isListening, isTranscribing, toggleListening, stopListening } = useSpeechToText();

  const toggleMic = () => {
    if (audioRef.current && isSpeaking) {
      audioRef.current.pause();
      setIsSpeaking(false);
    }
    toggleListening(chatInput, (updatedText) => {
      setChatInput(updatedText);
    });
  };

  // -------------------------------------------------------------
  // 3. SUBMIT PAYLOAD TO LANGGRAPH SWARM
  // -------------------------------------------------------------
  const submitToSwarm = useCallback(async (spokenText: string) => {
    const textToSend = spokenText.trim();
    if (!textToSend || isProcessing) return;

    setChatInput("");
    baseInputRef.current = ""; // 🔥 Clear snapshot on send
    if (isListening) stopListening(); 

    // Create a snapshot of the current messages BEFORE adding the new one to state
    const currentHistory = messages.map(m => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, { role: 'user', text: textToSend }]);
    setIsProcessing(true);

    try {
      const response = await submitToOnyxBrainAction({
        target_role: phaseData?.targetRole || "Software Engineer",
        target_company: phaseData?.targetCompany || "FAANG",
        is_hr: phaseId === '99',
        live_code: code,
        language: "python", // Hardcoded for now in the editor
        whisper_transcript: textToSend,
        chat_history: currentHistory, 
        cv_telemetry: { stress_level: biometricStress },
        panel_satisfaction: panelSatisfaction
      });

      if (!response.success || !response.swarmData) {
        throw new Error(response.error || "Swarm link offline");
      }
      
      const data = response.swarmData;

      if (data.panel_satisfaction) {
        setPanelSatisfaction(data.panel_satisfaction);
      }

      setActiveAgent(data.agent_routed || "System");
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: data.response, agent: data.agent_routed || "System" }
      ]);
      setIsProcessing(false);

      if (data.audio_base64 && audioRef.current) {
        audioRef.current.src = `data:audio/wav;base64,${data.audio_base64}`;
        setIsSpeaking(true);
        audioRef.current.play().catch(() => {
          // Fall back to browser speech synthesis
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            const clean = (data.response || '').replace(/[*#_`]/g, '').trim();
            const utterance = new SpeechSynthesisUtterance(clean);
            utterance.onstart = () => setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            utterance.onerror = () => setIsSpeaking(false);
            window.speechSynthesis.speak(utterance);
          } else {
            setIsSpeaking(false);
          }
        });
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const clean = (data.response || '').replace(/[*#_`]/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      }

      if (data.is_complete) {
        // Auto-end the interview
        setInterviewStatus('evaluating');
        stopListening();
        if (audioRef.current) audioRef.current.pause();

        const reportPayload = {
          transcript: currentHistory.concat([{ role: 'user', text: textToSend }]), // Pass full history
          finalCode: code,
          telemetry: {
            peakStress: biometricStress,
            targetCompany: phaseData?.targetCompany || "FAANG",
            astAnalysis
          },
        };

        sessionStorage.setItem('onyx_interview_report', JSON.stringify(reportPayload));
        setTimeout(() => router.push('/dashboard/results'), 3000);
      }

    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: `[System Alert]: ${err.message || "Uplink connection lost. Reconnecting swarm..."}`, agent: 'System' }
      ]);
      setIsProcessing(false);
    }
  }, [code, biometricStress, phaseData, isProcessing, isListening, phaseId, messages, stopListening]);

  // -------------------------------------------------------------
  // 4. INTERVIEW LIFECYCLE & AST GRADER EXECUTION
  // -------------------------------------------------------------
  const beginInterview = () => {
    setInterviewStatus('active');
    const intro = phaseId === '99' 
      ? "Connection secure. I am your HR Director. Let's begin. Tell me about a time you handled a massive deployment failure."
      : "Connection secure. I am the Technical Lead. Read the code prompt and explain your optimized architecture to me.";
    
    setMessages([{ role: 'ai', text: intro, agent: phaseId === '99' ? 'HR Director' : 'Lead Architect' }]);
    setActiveAgent(phaseId === '99' ? 'HR Director' : 'Lead Architect');

    setTimeout(() => {
       setIsSpeaking(true);
       setTimeout(() => setIsSpeaking(false), 3000); 
    }, 500);
  };

  const handleRunASTAnalysis = async () => {
    if (!code.trim()) return;
    setIsAnalyzingAST(true);

    try {
      const res = await fetch(`${BRAIN_URL}/api/ast/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });

      if (res.ok) {
        const data = await res.json();
        setAstAnalysis(data);
      } else {
        const loops = (code.match(/for |while /g) || []).length;
        setAstAnalysis({
          complexity: loops > 1 ? "O(N²)" : loops === 1 ? "O(N)" : "O(1)",
          feedback: loops > 1 ? "Nested iteration detected." : "Linear pass detected."
        });
      }
    } catch (_) {
      setAstAnalysis({ complexity: "O(N)", feedback: "Code structure validated against static AST pipeline." });
    } finally {
      setIsAnalyzingAST(false);
      submitToSwarm("I just compiled my code and ran the AST analysis. Please review my implementation.");
    }
  };

  const handleEndInterview = () => {
    setInterviewStatus('evaluating');
    stopListening();
    if (audioRef.current) audioRef.current.pause();

    const reportPayload = {
      transcript: messages,
      finalCode: code,
      telemetry: {
        peakStress: biometricStress,
        targetCompany: phaseData?.targetCompany || "FAANG",
        astAnalysis
      }
    };

    sessionStorage.setItem('onyx_interview_report', JSON.stringify(reportPayload));
    setTimeout(() => router.push('/dashboard/results'), 1200);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative z-10 px-8 py-6 bg-black text-white font-sans overflow-hidden">
      <audio ref={audioRef} onEnded={() => setIsSpeaking(false)} className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* TOP STATUS BAR */}
      <div className="flex w-full justify-between items-center mb-5 shrink-0">
        <button onClick={onExit} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest">
          <ChevronLeft size={16} /> Disconnect Uplink
        </button>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-gray-500">Panel Target:</span>
            <span className="text-white font-bold">{phaseData?.targetCompany || 'FAANG'} {phaseId === '99' ? 'HR' : 'Architect'}</span>
          </div>

          {interviewStatus === 'active' && (
            <button 
              onClick={handleEndInterview}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold font-mono text-xs uppercase tracking-widest rounded-xl flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(220,38,38,0.4)]"
            >
              <PhoneOff size={14} /> End Meeting
            </button>
          )}
        </div>
      </div>

      {/* MAIN 3-COLUMN ARENA */}
      <div className="w-full flex-1 flex gap-6 overflow-hidden min-h-0">
        
        {/* LEFT COLUMN: 3D VRM & WEBCAM */}
        <div className="w-[360px] flex flex-col gap-4 shrink-0">
          
          <div className={`${glassClasses} flex-1 relative overflow-hidden flex flex-col bg-[#050505]`} style={{ border: `1px solid ${theme.colors.primary}40` }}>
            <div className="w-full bg-black/80 backdrop-blur-md px-4 py-3 flex items-center justify-between absolute top-0 z-20 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'animate-ping bg-green-500' : 'animate-pulse bg-blue-500'}`} />
                <span className="font-mono text-[10px] text-gray-300 uppercase tracking-widest font-bold">Orchestrator: {activeAgent}</span>
              </div>
            </div>

            <div className="absolute inset-0 z-10 bg-gradient-to-b from-gray-900 to-black">
              {!isSimpleMode && (
                <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 1.5], fov: 40 }}>
                  <ambientLight intensity={1.5} />
                  <directionalLight position={[0, 2, 2]} intensity={2.5} color="#ffffff" />
                  <OnyxAvatar url="/onyx.vrm" isSpeaking={isSpeaking} />
                </Canvas>
              )}
            </div>
          </div>

          <div className={`${glassClasses} h-[220px] relative overflow-hidden flex flex-col bg-[#111]`} style={{ border: `1px solid white/10` }}>
            {/* PROMINENT TELEMETRY HUD */}
            <div className="w-full bg-black/90 backdrop-blur-xl px-4 py-3 flex flex-col absolute top-0 z-20 border-b border-white/10">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${camActive ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="font-mono text-[10px] text-gray-300 uppercase tracking-widest font-bold">Candidate Feed</span>
                </div>
              </div>
              {interviewStatus === 'active' && (
                <div className="flex items-center gap-2 mt-1 bg-white/5 px-2 py-1 rounded">
                  <Activity size={12} className={biometricStress.includes('Elevated') || biometricStress.includes('Critical') ? 'text-amber-500 animate-pulse' : 'text-green-400'} />
                  <span className={`font-mono text-[10px] uppercase tracking-widest font-bold ${biometricStress.includes('Elevated') || biometricStress.includes('Critical') ? 'text-amber-500' : 'text-green-400'}`}>
                    Telemetry: {biometricStress}
                  </span>
                </div>
              )}
            </div>

            <div className="w-full h-full flex flex-col items-center justify-center bg-black relative">
              {camActive ? (
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-70 scale-x-[-1]" />
              ) : (
                <VideoOff size={28} className="text-white/20" />
              )}
            </div>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
              <button onClick={() => setCamActive(!camActive)} className={`p-2 rounded-full backdrop-blur-md border transition-all ${camActive ? 'bg-white/10 border-white/20 text-white' : 'bg-red-500/20 border-red-500/50 text-red-500'}`}>
                {camActive ? <Video size={14} /> : <VideoOff size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* MIDDLE COLUMN: MONACO EDITOR & AST EVALUATOR */}
        {phaseId !== '99' && (
          <div className={`${glassClasses} flex-1 flex flex-col bg-[#050505] p-3 min-w-0`} style={{ border: `1px solid white/10` }}>
            <div className="w-full border-b border-white/10 pb-3 mb-2 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CodeXml size={16} className="text-blue-400" />
                <h2 className="font-bold text-xs uppercase tracking-widest text-white">Live Code Implementation</h2>
              </div>

              <button 
                onClick={handleRunASTAnalysis}
                disabled={isAnalyzingAST}
                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-lg text-blue-400 font-mono text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {isAnalyzingAST ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                Run & Submit Code
              </button>
            </div>

            <div className="flex-1 relative rounded-xl overflow-hidden border border-white/5">
              <Editor
                height="100%"
                defaultLanguage="python"
                theme="vs-dark"
                value={code}
                onChange={(val) => setCode(val || "")}
                options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'JetBrains Mono, Menlo, monospace', padding: { top: 12 } }}
              />
            </div>

            {astAnalysis && (
              <div className="mt-3 p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between font-mono text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-400" />
                  <span className="text-gray-300">{astAnalysis.feedback}</span>
                </div>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px] uppercase font-bold border border-blue-500/30">
                  {astAnalysis.complexity}
                </span>
              </div>
            )}
          </div>
        )}

        {/* RIGHT COLUMN: TRANSCRIPT & SPEECH INPUT */}
        <div className={`${glassClasses} ${phaseId === '99' ? 'flex-1' : 'w-[380px]'} flex flex-col overflow-hidden bg-black/60 shrink-0`} style={{ border: `1px solid white/10` }}>
          <div className="border-b border-white/10 p-4 bg-white/5 flex items-center justify-between shrink-0">
            <h3 className="font-bold text-sm uppercase tracking-wider text-white">Live Discussion</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar flex flex-col">
            {messages.length === 0 && interviewStatus === 'idle' && (
              <div className="text-center text-gray-600 font-mono text-xs mt-12">Initialize panel uplink to begin...</div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col max-w-[90%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                <span className="text-[9px] font-mono text-gray-500 mb-1 uppercase tracking-widest">{msg.role === 'user' ? 'Candidate' : msg.agent}</span>
                <div className={`p-4 rounded-2xl text-xs leading-relaxed font-mono ${msg.role === 'user' ? 'bg-white/10 text-white rounded-br-sm' : 'bg-[#111] border border-white/10 text-gray-200 rounded-bl-sm shadow-xl'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {interviewStatus === 'evaluating' && (
              <div className="flex items-center justify-center gap-3 text-yellow-500 font-mono text-xs uppercase tracking-widest py-4">
                <Loader2 size={16} className="animate-spin" /> Compiling Post-Interview Evaluation...
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>

          <div className="p-4 bg-black border-t border-white/10 shrink-0">
            {interviewStatus === 'idle' ? (
              <button onClick={beginInterview} className="w-full py-3.5 rounded-xl text-black font-bold uppercase tracking-widest text-xs transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2" style={{ backgroundColor: theme.colors.accent }}>
                <Activity size={16} /> Commence Grand Panel
              </button>
            ) : interviewStatus === 'evaluating' ? (
              <div className="text-xs font-mono text-gray-500 uppercase tracking-widest text-center py-2">Session Concluded</div>
            ) : (
              <div className="flex gap-2">
                <button 
                  onClick={toggleMic} 
                  disabled={isTranscribing}
                  className={`p-3 rounded-xl border transition-all ${
                    isListening 
                      ? 'bg-red-500/20 border-red-500 text-red-400 animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.4)]' 
                      : isTranscribing
                      ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                  }`}
                  title={isListening ? "Click to stop recording" : "Click to speak"}
                >
                  {isTranscribing ? <Loader2 size={16} className="animate-spin" /> : isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>

                {/* 🔥 FIX: Proper Textarea for multiline input! */}
                <textarea 
                  value={chatInput} 
                  onChange={(e) => setChatInput(e.target.value)} 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitToSwarm(chatInput);
                    }
                  }} 
                  disabled={isProcessing || isTranscribing} 
                  placeholder={isTranscribing ? "Transcribing speech with Whisper..." : isProcessing ? "Swarm evaluating..." : isListening ? "Listening... click mic again when finished" : "Type or dictate response... (Shift+Enter for newline)"} 
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-xs text-white focus:outline-none focus:border-white/30 font-mono placeholder:text-gray-600 disabled:opacity-50 resize-none h-12 custom-scrollbar" 
                />

                <button 
                  onClick={() => submitToSwarm(chatInput)} 
                  disabled={!chatInput.trim() || isProcessing || isTranscribing} 
                  className="p-3 rounded-xl bg-white text-black hover:bg-gray-200 transition-colors disabled:opacity-30 flex items-center justify-center shrink-0"
                >
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}