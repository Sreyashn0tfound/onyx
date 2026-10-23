'use client';

import { useState, useRef } from 'react';
import { conductGeneralHRAction } from '../actions';
import { useSpeechToText } from '@/lib/useSpeechToText';

interface VoiceInterviewProps {
  targetRole: string;
  // FIXED: Added the callback prop here so TypeScript and React know it exists
  onInterviewComplete: (transcript: {role: 'ai' | 'user', text: string}[]) => void;
}

type InterviewState = 'idle' | 'listening' | 'thinking' | 'speaking';

// FIXED: Destructured the onInterviewComplete prop right here
export default function VoiceInterview({ targetRole, onInterviewComplete }: VoiceInterviewProps) {
  const [interviewState, setInterviewState] = useState<InterviewState>('idle');
  const [transcript, setTranscript] = useState("");
  const [chatHistory, setChatHistory] = useState<{role: 'ai' | 'user', text: string}[]>([]);

  const { isListening, toggleListening, stopListening } = useSpeechToText();

  const startInterview = () => {
    const greeting = `Hello. I am Torii, your AI interviewer. I see you are applying for the ${targetRole} position. Are you ready to begin?`;
    setChatHistory([{ role: 'ai', text: greeting }]);
    speak(greeting);
  };

  const startListening = () => {
    setTranscript("");
    setInterviewState('listening');
    toggleListening("", (updatedText) => {
      setTranscript(updatedText);
    });
  };

  const handleUserFinishedSpeaking = async () => {
    if (!transcript.trim()) {
      setInterviewState('idle');
      return;
    }

    setInterviewState('thinking');
    const newHistory = [...chatHistory, { role: 'user' as const, text: transcript }];
    setChatHistory(newHistory);

    // Call Groq Action
    const response = await conductGeneralHRAction(newHistory, targetRole);
    
    if (response.success && response.reply) {
      const aiReply = response.reply;
      setChatHistory([...newHistory, { role: 'ai', text: aiReply }]);
      speak(aiReply);
    } else {
      speak("I seem to have lost my connection. Let's try that again.");
      setInterviewState('idle');
    }
  };

  // The Browser's Native Voice Engine
  const speak = (text: string) => {
    setInterviewState('speaking');
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Make the voice sound professional (usually a female or deep male voice depending on OS)
    utterance.rate = 0.95; 
    utterance.pitch = 1;

    utterance.onend = () => {
      setInterviewState('idle');
      // Auto-start listening after AI finishes speaking
      startListening();
    };

    window.speechSynthesis.speak(utterance);
  };

  const endInterview = () => {
    window.speechSynthesis.cancel();
    stopListening();
    setInterviewState('idle');
    console.log("FINAL TRANSCRIPT:", chatHistory);
    
    // Trigger the transition!
    onInterviewComplete(chatHistory);
  };

  // --- CRAZY ANIMATION LOGIC ---
  const getOrbStyles = () => {
    switch (interviewState) {
      case 'listening':
        return "bg-emerald-500 shadow-[0_0_80px_rgba(16,185,129,0.8)] scale-110 animate-pulse";
      case 'thinking':
        return "bg-purple-500 shadow-[0_0_100px_rgba(168,85,247,1)] animate-spin scale-90";
      case 'speaking':
        return "bg-cyan-400 shadow-[0_0_150px_rgba(34,211,238,1)] animate-ping scale-125";
      default:
        return "bg-slate-700 shadow-[0_0_20px_rgba(51,65,85,0.5)] scale-100";
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[600px] bg-slate-950 border border-slate-800 rounded-2xl p-8 relative overflow-hidden">
      
      {/* Background ambient glow */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 blur-3xl rounded-full opacity-20 transition-all duration-700 ${getOrbStyles()}`}></div>

      {/* Header */}
      <div className="absolute top-6 left-6 flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${interviewState !== 'idle' ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`}></div>
        <span className="font-mono text-xs text-slate-400 uppercase tracking-widest">Torii Live Audio Session</span>
      </div>

      {/* THE ORB (Crazy Animations) */}
      <div className="relative z-10 flex items-center justify-center h-64 w-64 my-12">
        <div className={`w-32 h-32 rounded-full transition-all duration-500 ease-in-out ${getOrbStyles()}`}></div>
        
        {/* Inner core */}
        <div className="absolute w-24 h-24 bg-white rounded-full opacity-20 blur-md mix-blend-overlay"></div>
      </div>

      {/* Status Text */}
      <div className="text-center z-10 h-24 mb-8">
        <h2 className="text-2xl font-bold text-white tracking-wide mb-2">
          {interviewState === 'idle' && "Ready to Begin"}
          {interviewState === 'listening' && "Listening to you..."}
          {interviewState === 'thinking' && "Torii is analyzing..."}
          {interviewState === 'speaking' && "Torii is speaking"}
        </h2>
        <p className="text-slate-400 font-mono text-sm max-w-md mx-auto italic h-12 overflow-hidden">
          {interviewState === 'listening' ? `"${transcript}"` : chatHistory[chatHistory.length - 1]?.text}
        </p>
      </div>

      {/* Controls */}
      <div className="z-10 flex gap-4 mt-auto">
        {chatHistory.length === 0 ? (
          <button onClick={startInterview} className="px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-slate-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.3)]">
            Start Mock Interview
          </button>
        ) : (
          <button onClick={endInterview} className="px-8 py-3 bg-red-600 text-white font-bold rounded-full hover:bg-red-500 transition-colors">
            End Interview
          </button>
        )}
      </div>
    </div>
  );
}