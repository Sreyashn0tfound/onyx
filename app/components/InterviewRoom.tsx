'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Play, Target, MessageSquare, Send, Loader2, Mic, Video, VideoOff, MicOff, Activity } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';

import { 
  conductGeneralHRAction,
  conductInterviewAction,
  transcribeAudioAction,
  evaluateInterviewAction
} from '@/app/actions'; 

// --- THE VRM AVATAR ---
export function OnyxAvatar({ url, isSpeaking }: { url: string, isSpeaking: boolean }) {
  const [vrm, setVrm] = useState<VRM | null>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    // @ts-ignore
    loader.register((parser: any) => new VRMLoaderPlugin(parser));
    
    loader.load(url, 
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
      (error: any) => console.error('Error loading Avatar:', error)
    );
  }, [url]);

  useFrame((state, delta) => {
    if (vrm) {
      vrm.update(delta);
      const blinkProbability = Math.random();
      if (blinkProbability < 0.02) vrm.expressionManager?.setValue('blink', 1.0);
      else vrm.expressionManager?.setValue('blink', 0.0);

      if (isSpeaking) {
         const mouthOpen = Math.random() * 0.8; 
         vrm.expressionManager?.setValue('aa', mouthOpen);
      } else {
         vrm.expressionManager?.setValue('aa', 0.0); 
      }
    }
  });

  if (vrm) return <primitive object={vrm.scene} position={[0, -1.4, 0]} scale={[1, 1, 1]} />;
  return null;
}

// --- THE MAIN COMPONENT ---
export default function InterviewRoom({ phaseId, phaseData, theme, onExit, isSimpleMode }: any) {
  const [interviewStatus, setInterviewStatus] = useState<'idle' | 'active' | 'evaluating'>('idle');
  const [isListening, setIsListening] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);

  const [camActive, setCamActive] = useState(true);
  const [micActive, setMicActive] = useState(true);
  
  // 🔥 NEW: REAL WEBCAM REFS
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const interviewTimerRef = useRef<NodeJS.Timeout | null>(null);

  const turnStartTimeRef = useRef<number>(0); 
  const maxLatencyRef = useRef<number>(0);
  const hesitationCountRef = useRef<number>(0);

  const glassClasses = `bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl`;
  const getDynamicGlow = (intensity: number) => `-${intensity}0px 0 100px -30px ${theme.colors.glow}`;

  // 🔥 NEW: BOOT UP THE USERS REAL WEBCAM
  useEffect(() => {
    if (camActive) {
      navigator.mediaDevices.getUserMedia({ video: true })
        .then((stream) => {
          setMediaStream(stream);
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => {
          console.error("Camera denied/missing", err);
          setCamActive(false);
        });
    } else {
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        setMediaStream(null);
      }
    }
    return () => {
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    };
  }, [camActive]);

  const beginInterview = () => {
    setInterviewStatus('active');
    maxLatencyRef.current = 0;
    hesitationCountRef.current = 0;

    const initialGreeting = phaseId === '99'
      ? "Uplink established. I am your HR evaluator. Let's begin. Tell me a bit about your background and why you want this role."
      : "Uplink established. I am the Technical Lead. Are you ready to begin the architecture review?";
    
    setMessages([{ role: 'ai', text: initialGreeting }]);
    speakResponse(initialGreeting);

    if (phaseId === '99') {
      interviewTimerRef.current = setTimeout(() => {
        triggerEvaluation("The allocated 5 minutes for this behavioral screen have expired. Concluding session.");
      }, 5 * 60 * 1000);
    }
  };

  const triggerEvaluation = async (finalMessage: string) => {
    setInterviewStatus('evaluating');
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
    if (interviewTimerRef.current) clearTimeout(interviewTimerRef.current);

    setMessages(prev => [...prev, { role: 'ai', text: finalMessage }]);
    setMessages(prev => [...prev, { role: 'ai', text: "[SYSTEM]: Compiling Biometric Telemetry & Generating Final Score..." }]);

    const currentBiometrics = { 
      hesitationCount: hesitationCountRef.current, 
      maxLatency: maxLatencyRef.current 
    };

    const res = await evaluateInterviewAction(
      messages, 
      phaseData?.targetRole || "Software Engineer", 
      phaseId === '99',
      "user_12345", 
      currentBiometrics
    );

    if (res.success) {
       // 🔥 PACK THE DATA AND REDIRECT TO THE RESULTS PAGE
       const finalPayload = {
         ...res.report,
         biometrics: currentBiometrics // Pass the raw numbers so the UI can render them
       };
       sessionStorage.setItem('onyx_interview_report', JSON.stringify(finalPayload));
       
       // Import useRouter at the top of InterviewRoom if you haven't! 
       // const router = useRouter(); inside the component.
       window.location.href = '/dashboard/results'; 
    } else {
       alert("Evaluation Failed to Generate.");
       setInterviewStatus('idle');
    }
  };

  const speakResponse = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); 
    
    const utterance = new SpeechSynthesisUtterance(text);
    const triggerSpeech = () => {
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Zira') || v.name.includes('Google UK English Female') || v.name.includes('Karen') || v.name.includes('Tessa'));
      if (femaleVoice) utterance.voice = femaleVoice;
      utterance.pitch = 1.4; 
      utterance.rate = 1.05;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        if (interviewStatus === 'active') {
          turnStartTimeRef.current = Date.now(); 
          startWhisperUplink(); 
        }
      };
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) window.speechSynthesis.onvoiceschanged = triggerSpeech;
    else triggerSpeech();
  };

  const processTranscribedText = async (text: string) => {
    const fillers = text.match(/\b(um|umm|uh|uhh|ah|like)\b/gi);
    if (fillers) hesitationCountRef.current += fillers.length;

    setMessages(prev => [...prev, { role: 'user', text: text }, { role: 'ai', text: `[Onyx Evaluator]: Analyzing response...` }]);

    try {
      let res;
      if (phaseId === '99') {
        res = await conductGeneralHRAction(messages.concat([{role: 'user', text}]), phaseData?.targetRole || "Software Engineer", {
           resumeSummary: "6th Sem CS AIML Student at NCET. Built SideQuest and Adaptive Traffic OS.",
           github: "github.com/candidate",
           linkedin: "linkedin.com/in/candidate"
        });
      } else {
        res = await conductInterviewAction(messages.concat([{role: 'user', text}]), phaseData?.targetRole || "Software Engineer");
      }

      if (res.success) {
        const safeReply = res.reply || "[System Alert]: Transmission dropped.";
        if (phaseId === '100' && (safeReply.toLowerCase().includes("concludes our interview") || safeReply.toLowerCase().includes("that will be all"))) {
           triggerEvaluation(safeReply);
           return;
        }
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'ai', text: safeReply };
          return updated;
        });
        speakResponse(safeReply);
      }
    } catch (err) { console.error(err); }
  };

  const startWhisperUplink = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const audioChunks: Blob[] = [];

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.minDecibels = -50; 
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let silenceTimer: NodeJS.Timeout;

      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsProcessingAudio(true);
        stream.getTracks().forEach(track => track.stop());
        if (audioCtx.state !== 'closed') audioCtx.close();

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append("audio", audioBlob, "uplink.webm");

        const res = await transcribeAudioAction(formData);
        setIsProcessingAudio(false);

        if (res.success && res.text) processTranscribedText(res.text);
      };

      const detectSilence = () => {
        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b) / bufferLength;

        if (volume > 5) { 
          if (turnStartTimeRef.current > 0) {
            const latency = Date.now() - turnStartTimeRef.current;
            if (latency > maxLatencyRef.current) maxLatencyRef.current = latency;
            turnStartTimeRef.current = 0; 
          }
          clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            if (mediaRecorder.state === 'recording') mediaRecorder.stop();
          }, 2000); 
        }

        if (mediaRecorder.state === 'recording') requestAnimationFrame(detectSilence);
      };

      mediaRecorder.start();
      setIsListening(true);
      
      silenceTimer = setTimeout(() => {
        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
      }, 2000);
      detectSilence();

    } catch (err) {
      console.error("Mic access denied", err);
      // Auto-fallback if mic is denied
      setIsSpeaking(false);
      setIsListening(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-500 relative z-10 px-10 py-6 bg-black">
      <div className="flex w-full justify-between items-center mb-6 shrink-0">
        <button onClick={onExit} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest"><ChevronLeft size={16} /> Disconnect Uplink</button>
        <h1 className="text-2xl font-bold uppercase tracking-widest text-white" style={{ color: theme.colors.primary }}>{theme.name} // TERMINAL</h1>
      </div>

      <div className="w-full flex-1 flex gap-6 overflow-hidden">
        
        <div className="w-[400px] flex flex-col gap-6 shrink-0">
          
          <div className={`${glassClasses} flex-1 relative overflow-hidden flex flex-col bg-[#050505]`} style={{ border: `1px solid ${theme.colors.primary}50`, boxShadow: getDynamicGlow(10) }}>
            <div className="w-full bg-black/80 backdrop-blur-md px-4 py-3 flex items-center justify-between absolute top-0 z-20">
               <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'animate-ping bg-green-500' : 'animate-pulse bg-[#0a84ff]'}`}></div>
                 <span className="font-mono text-[10px] text-gray-300 uppercase tracking-widest font-bold">Onyx Evaluator</span>
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

          <div className={`${glassClasses} h-[250px] relative overflow-hidden flex flex-col bg-[#111]`} style={{ border: `1px solid white/10` }}>
            <div className="w-full bg-black/80 backdrop-blur-md px-4 py-3 flex items-center justify-between absolute top-0 z-20">
               <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${camActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                 <span className="font-mono text-[10px] text-gray-300 uppercase tracking-widest font-bold">Candidate Uplink</span>
               </div>
               <div className="flex gap-2">
                 {camActive ? <Video size={14} className="text-green-500" /> : <VideoOff size={14} className="text-red-500" />}
                 {micActive ? <Mic size={14} className="text-green-500" /> : <MicOff size={14} className="text-red-500" />}
               </div>
            </div>
            
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 bg-gradient-to-t from-black to-gray-900 relative">
              {camActive ? (
                // 🔥 REAL WEBCAM FEED HERE
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-70 scale-x-[-1]" />
              ) : (
                <>
                  <VideoOff size={32} className="mb-2 text-white/20" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-red-500/50">Camera Disabled</span>
                </>
              )}
            </div>

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-20">
              <button onClick={() => setMicActive(!micActive)} className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${micActive ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : 'bg-red-500/20 border-red-500/50 text-red-500 hover:bg-red-500/30'}`}>
                {micActive ? <Mic size={16} /> : <MicOff size={16} />}
              </button>
              <button onClick={() => setCamActive(!camActive)} className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${camActive ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : 'bg-red-500/20 border-red-500/50 text-red-500 hover:bg-red-500/30'}`}>
                {camActive ? <Video size={16} /> : <VideoOff size={16} />}
              </button>
            </div>
          </div>

        </div>

        <div className={`${glassClasses} flex-1 flex flex-col overflow-hidden bg-black/60`} style={{ border: `1px solid white/10` }}>
          <div className="w-full border-b border-white/10 p-6 bg-white/5 shrink-0 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-xl uppercase tracking-tighter text-white">Live Transcript</h2>
              <p className="text-xs font-mono text-gray-400 mt-1 uppercase tracking-widest">End-to-end encrypted session</p>
            </div>
            {interviewStatus === 'active' && (
              <button onClick={() => triggerEvaluation("User manually aborted session.")} className="px-4 py-2 rounded border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-mono hover:bg-red-500/20 transition-colors">Force End Interview</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar flex flex-col">
            {messages.length === 0 && interviewStatus === 'idle' && (
              <div className="text-center text-gray-600 font-mono text-sm mt-10">Awaiting interview start...</div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}>
                <span className="text-[10px] font-mono text-gray-500 mb-2 uppercase tracking-widest px-1">{msg.role === 'user' ? 'Candidate' : 'Onyx Evaluator'}</span>
                <div className={`p-5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-white/10 text-white rounded-br-sm' : 'bg-black/80 border border-white/10 text-gray-200 rounded-bl-sm shadow-xl'}`} style={msg.role === 'user' ? {} : { borderLeft: `2px solid ${theme.colors.primary}` }}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          
          <div className="p-6 bg-black border-t border-white/10 shrink-0 flex flex-col items-center justify-center gap-4 min-h-[100px]">
            {interviewStatus === 'idle' ? (
               <button onClick={beginInterview} className="px-8 py-4 rounded-xl text-black font-bold uppercase tracking-widest transition-all hover:scale-[1.05] active:scale-95 flex items-center justify-center gap-3" style={{ backgroundColor: theme.colors.accent }}>
                 <Activity size={20} className="text-black" /> Start Interview
               </button>
            ) : interviewStatus === 'evaluating' ? (
               <div className="flex items-center gap-3 text-yellow-500 font-mono text-xs uppercase tracking-widest font-bold">
                 <Loader2 size={16} className="animate-spin" /> Compiling Biometric Report...
               </div>
            ) : isSpeaking ? (
              <div className="flex items-center gap-3 text-gray-400 font-mono text-xs uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-[#0a84ff] animate-ping"></div> AI is Speaking...
              </div>
            ) : isProcessingAudio ? (
              <div className="flex items-center gap-3 text-purple-400 font-mono text-xs uppercase tracking-widest">
                <Loader2 size={14} className="animate-spin" /> Decrypting Whisper Audio...
              </div>
            ) : isListening ? (
              <div className="flex items-center gap-3 text-red-500 font-mono text-xs uppercase tracking-widest font-bold">
                <div className="flex gap-1 items-center h-4">
                  <div className="w-1 bg-red-500 animate-[bounce_1s_infinite] h-full"></div>
                  <div className="w-1 bg-red-500 animate-[bounce_1s_infinite_0.2s] h-2/3"></div>
                  <div className="w-1 bg-red-500 animate-[bounce_1s_infinite_0.4s] h-full"></div>
                </div>
                Listening (Auto-stops after 2s pause)
              </div>
            ) : null}
          </div>
        </div>

      </div>
    </div>
  );
}