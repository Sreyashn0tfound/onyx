'use client';

import { useState, useEffect, useRef } from 'react';
import { conductInterviewAction, conductGeneralHRAction } from '../actions';

interface VoiceInterviewProps {
  targetRole: string;
  // NEW WIRING: Added biometrics to the callback signature so the dashboard can catch it
  onInterviewComplete: (transcript: {role: 'ai' | 'user', text: string}[], biometrics?: { hesitationCount: number; maxLatency: number }) => void;
  isGeneralHR?: boolean; 
}

type InterviewState = 'idle' | 'listening' | 'thinking' | 'speaking';

export default function VoiceInterview({ targetRole, onInterviewComplete, isGeneralHR }: VoiceInterviewProps) {
  const [interviewState, setInterviewState] = useState<InterviewState>('idle');
  const [transcript, setTranscript] = useState("");
  const [chatHistory, setChatHistory] = useState<{role: 'ai' | 'user', text: string}[]>([]);
  
  // Biometric & Cognitive Load State
  const [hesitationCount, setHesitationCount] = useState(0);
  const [lastLatency, setLastLatency] = useState<number>(0);
  const [isCameraActive, setIsCameraActive] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef(""); 
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Timing Refs for Latency
  const aiEndTimeRef = useRef<number | null>(null);
  const userStartTimeRef = useRef<number | null>(null);
  
  const stateRef = useRef<InterviewState>('idle');
  const chatHistoryRef = useRef<{role: 'ai' | 'user', text: string}[]>([]);
  
  const changeState = (newState: InterviewState) => {
    setInterviewState(newState);
    stateRef.current = newState;
  };

  // --- CAMERA INITIALIZATION ---
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.error("Webcam access error:", err);
      setIsCameraActive(false); // Ensure UI knows camera is off
      
      if (err.name === 'NotReadableError') {
        alert("Onyx Vision Alert: Your webcam is currently being used by another application (like Zoom or Discord). Please close it to enable visual tracking.");
      } else if (err.name === 'NotAllowedError') {
        alert("Onyx Vision Alert: Camera access was denied. Please allow permissions in your browser URL bar.");
      } else {
        alert("Onyx Vision Alert: Could not connect to camera hardware.");
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    let silenceTimer: any; 
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true; 
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        // Mark user start time if this is the first word spoken after AI stopped
        if (aiEndTimeRef.current && !userStartTimeRef.current) {
          userStartTimeRef.current = Date.now();
          const latency = userStartTimeRef.current - aiEndTimeRef.current;
          setLastLatency(latency);
        }

        const currentTranscript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        
        setTranscript(currentTranscript);
        transcriptRef.current = currentTranscript; 

        // LEXICAL HESITATION TRACKER ("umm", "uhh")
        const matchUmms = currentTranscript.match(/\b(um|uh|uhh|umm|like)\b/gi);
        if (matchUmms) {
          setHesitationCount(matchUmms.length);
        }

        clearTimeout(silenceTimer); 
        silenceTimer = setTimeout(() => {
          if (recognitionRef.current && stateRef.current === 'listening') {
            recognitionRef.current.stop();
          }
        }, 2000); 
      };

      recognitionRef.current.onend = () => {
        if (stateRef.current === 'listening') {
          handleUserFinishedSpeaking();
        }
      };
    } else {
      alert("Your browser doesn't support Voice AI. Please use Chrome or Edge.");
    }

    return () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      if (recognitionRef.current) recognitionRef.current.stop();
      stopCamera();
    };
  }, []); 

  const startInterview = () => {
    startCamera(); // Ignite the visor
    setHesitationCount(0);
    setLastLatency(0);

    const greeting = isGeneralHR 
      ? `Hello! I am Onyx HR. I'll be conducting your behavioral round today. Are you ready to begin?`
      : `Hello. I am Onyx, your AI technical architect. I see you are applying for the ${targetRole} position. Are you ready to begin?`;
    
    const initHistory = [{ role: 'ai' as const, text: greeting }];
    chatHistoryRef.current = initHistory;
    setChatHistory(initHistory);
    speak(greeting);
  };

  const startListening = () => {
    setTranscript("");
    transcriptRef.current = "";
    userStartTimeRef.current = null; // Reset for next answer
    aiEndTimeRef.current = Date.now(); // AI just finished talking
    changeState('listening');
    try {
      recognitionRef.current?.start();
    } catch (e) {
      console.error("Mic start error:", e);
    }
  };

  const handleUserFinishedSpeaking = async () => {
    const finalSpokenText = transcriptRef.current.trim();
    
    if (!finalSpokenText) {
      changeState('idle');
      return;
    }

    changeState('thinking');
    
    const newHistory = [...chatHistoryRef.current, { role: 'user' as const, text: finalSpokenText }];
    chatHistoryRef.current = newHistory;
    setChatHistory(newHistory);
    
    triggerAI(newHistory);
  };

  const triggerAI = async (currentHistory: any[]) => {
    try {
      const response = isGeneralHR 
        ? await conductGeneralHRAction(currentHistory, targetRole)
        : await conductInterviewAction(currentHistory, targetRole);
      
      if (response.success && response.reply) {
        const aiReply = response.reply;
        const updatedHistory = [...chatHistoryRef.current, { role: 'ai' as const, text: aiReply }];
        
        chatHistoryRef.current = updatedHistory;
        setChatHistory(updatedHistory);
        speak(aiReply);
      } else {
        speak("I seem to have lost my connection to the matrix. Let's try that again.");
        changeState('idle');
      }
    } catch (networkError) {
      speak("Critical network error hitting the core servers.");
      changeState('idle');
    }
  };

  // --- PREMIUM NEURAL VOICE SELECTOR ---
  const speak = (text: string) => {
    changeState('speaking');
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Find the best neural voice available in the browser
    const voices = window.speechSynthesis.getVoices();
    const premiumVoice = voices.find(v => v.name.includes("Google UK English Male") || v.name.includes("Neural") || v.name.includes("Samantha"));
    if (premiumVoice) utterance.voice = premiumVoice;

    utterance.rate = 0.98; 
    utterance.pitch = isGeneralHR ? 1.1 : 0.9; 

    utterance.onend = () => {
      changeState('idle');
      startListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  // Pre-load voices on mount to avoid the empty array bug in Chrome
  useEffect(() => { window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices(); }, []);

  const endInterview = () => {
    window.speechSynthesis.cancel();
    if (recognitionRef.current) recognitionRef.current.stop();
    stopCamera();
    changeState('idle');
    // NEW WIRING: Pass the biometric data payload up to the parent page.tsx!
    onInterviewComplete(chatHistoryRef.current, { hesitationCount, maxLatency: lastLatency });
  };

  const getOrbStyles = () => {
    switch (interviewState) {
      case 'listening': return "bg-[#34c759] shadow-[0_0_100px_rgba(52,199,89,0.8)] scale-110 animate-pulse opacity-60";
      case 'thinking': return "bg-[#bf5af2] shadow-[0_0_120px_rgba(191,90,242,0.9)] scale-125 animate-[pulse_0.8s_ease-in-out_infinite] opacity-80";
      case 'speaking': return "bg-[#0a84ff] shadow-[0_0_150px_rgba(10,132,255,1)] scale-150 animate-[pulse_0.5s_ease-in-out_infinite] opacity-100";
      default: return "bg-white/10 shadow-[0_0_30px_rgba(255,255,255,0.1)] scale-100 opacity-20";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[600px] bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-10 relative overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
      <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>
      
      {/* Background Ambient Glow */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] blur-[150px] rounded-full transition-all duration-700 pointer-events-none ${getOrbStyles()} opacity-30`}></div>

      {/* Top Left Badge */}
      <div className="absolute top-8 left-8 flex items-center gap-3 bg-black/60 px-5 py-2.5 rounded-full border border-white/10 backdrop-blur-xl shadow-lg">
        <div className={`w-2.5 h-2.5 rounded-full ${interviewState !== 'idle' ? 'bg-[#ff3b30] animate-pulse shadow-[0_0_15px_rgba(255,59,48,0.8)]' : 'bg-[#86868b]'}`}></div>
        <span className="font-bold text-xs text-white uppercase tracking-widest">
          {isGeneralHR ? "Onyx Comm Lab" : "Onyx Tech Terminal"}
        </span>
      </div>

      {/* NEW: TOP RIGHT BIOMETRIC TRACKER UI */}
      {isCameraActive && (
        <div className="absolute top-8 right-8 flex flex-col items-end gap-3 z-20">
          {/* Live Webcam Feed */}
          <div className="relative w-48 h-32 bg-black rounded-2xl border border-white/20 overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover opacity-80 mix-blend-screen" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
            {/* Fake scanning UI */}
            <div className="absolute top-0 left-0 w-full h-[1px] bg-[#0071e3] shadow-[0_0_10px_#0071e3] animate-[scan_2s_linear_infinite]"></div>
            <span className="absolute bottom-2 left-2 text-[10px] font-mono text-[#0071e3] font-bold tracking-widest uppercase">Visual Inference Active</span>
          </div>

          {/* Cognitive Load Data */}
          <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-3 w-48 shadow-lg">
            <div className="flex justify-between items-center mb-2 border-b border-white/10 pb-2">
              <span className="text-[10px] text-[#a1a1a6] font-mono uppercase tracking-widest">Latency</span>
              <span className={`text-xs font-mono font-bold ${lastLatency > 2000 ? 'text-[#ff3b30]' : 'text-[#34c759]'}`}>
                {lastLatency > 0 ? `${(lastLatency / 1000).toFixed(1)}s` : '0.0s'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-[#a1a1a6] font-mono uppercase tracking-widest">Lexical Pauses</span>
              <span className={`text-xs font-mono font-bold ${hesitationCount > 2 ? 'text-[#ff9f0a]' : 'text-[#34c759]'}`}>
                {hesitationCount} detected
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ONYX CORE AVATAR */}
      <div className="relative z-10 flex items-center justify-center h-72 w-72 my-12 group">
        <div className={`absolute inset-0 rounded-full blur-2xl transition-all duration-500 ease-in-out ${getOrbStyles()}`}></div>
        <div className={`relative w-48 h-48 rounded-[2.5rem] overflow-hidden border-2 border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] transition-transform duration-300 ${interviewState === 'speaking' ? 'scale-105' : 'scale-100'}`}>
          <img src="/onyx-core.jpg" alt="Onyx Core" className="w-full h-full object-cover mix-blend-screen bg-black" />
          <div className="absolute inset-0 shadow-[inset_0_0_40px_rgba(0,0,0,0.9)] pointer-events-none"></div>
        </div>
      </div>

      <div className="text-center z-10 h-24 mb-10 w-full max-w-2xl px-6">
        <h2 className="text-3xl font-bold text-white tracking-tight mb-4">
          {interviewState === 'idle' && "Ready to Begin"}
          {interviewState === 'listening' && "Listening..."}
          {interviewState === 'thinking' && "Analyzing vectors..."}
          {interviewState === 'speaking' && "Onyx is speaking"}
        </h2>
        <p className="text-[#a1a1a6] text-lg italic h-14 overflow-hidden leading-relaxed font-light">
          {interviewState === 'listening' ? `"${transcript}"` : chatHistory[chatHistory.length - 1]?.text}
        </p>
      </div>

      <div className="z-10 flex gap-6 mt-auto">
        {chatHistory.length === 0 ? (
          <button onClick={startInterview} className="px-12 py-5 bg-white text-black font-bold text-lg rounded-full hover:scale-105 transition-all duration-300 shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-[0_0_60px_rgba(255,255,255,0.4)]">
            Initialize Session
          </button>
        ) : (
          <button onClick={endInterview} className="px-12 py-5 bg-[#ff3b30]/10 border border-[#ff3b30]/30 text-[#ff3b30] font-bold text-lg rounded-full hover:bg-[#ff3b30] hover:text-white transition-all duration-300 shadow-[0_0_30px_rgba(255,59,48,0.2)] hover:shadow-[0_0_50px_rgba(255,59,48,0.5)] backdrop-blur-md">
            Terminate Session
          </button>
        )}
      </div>
    </div>
  );
}