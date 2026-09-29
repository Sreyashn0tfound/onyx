'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { evaluateInterviewAction } from '@/app/actions'; 

export default function PostInterviewReport() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [targetCompany, setTargetCompany] = useState("FAANG");
  const [reportData, setReportData] = useState<{
    score: number;
    feedback: {
      strengths: string[];
      weaknesses: string[];
      summary: string;
      cognitive_analysis?: string;
    }
  } | null>(null);

  useEffect(() => {
    const processEvaluation = async () => {
      // 1. Pull the stashed payload from the Boss Fight
      const rawData = sessionStorage.getItem('onyx_interview_report');
      if (!rawData) {
        router.push('/dashboard');
        return;
      }

      const sessionData = JSON.parse(rawData);
      setTargetCompany(sessionData.telemetry?.targetCompany || "FAANG");

      try {
        // 2. Fire the massive transcript & code to Groq for the final brutal evaluation
        const response = await evaluateInterviewAction(
          sessionData.transcript,
          sessionData.telemetry?.targetCompany || "FAANG",
          sessionData.finalCode,
          sessionData.telemetry
        );

        if (response.success && response.report) {
          setReportData(response.report);
        } else {
          console.error("Evaluation failed to generate valid response.");
        }
      } catch (err) {
        console.error("Critical Failure during evaluation:", err);
      } finally {
        setLoading(false);
      }
    };

    processEvaluation();
  }, [router]);

  const handleFinish = () => {
    sessionStorage.removeItem('onyx_interview_report'); // Clean up
    router.push('/dashboard');
  };

  // --- LOADING STATE ---
  if (loading) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-black text-white">
        <div className="w-24 h-24 mb-8 relative flex items-center justify-center">
          <div className="absolute inset-0 border-t-2 border-blue-500 rounded-full animate-spin"></div>
          <div className="absolute inset-2 border-r-2 border-purple-500 rounded-full animate-[spin_1.5s_linear_infinite_reverse]"></div>
          <span className="text-3xl animate-pulse">🧠</span>
        </div>
        <h2 className="text-2xl font-bold uppercase tracking-widest mb-2">Onyx Neural Core</h2>
        <p className="text-gray-500 font-mono text-sm tracking-widest uppercase animate-pulse">
          Synthesizing Interview Transcript & Biometrics...
        </p>
      </div>
    );
  }

  // Fallback if the AI chokes
  if (!reportData) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-black text-white">
        <h2 className="text-xl font-bold text-red-500 mb-4">Evaluation Payload Corrupted</h2>
        <button onClick={handleFinish} className="px-6 py-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors">Return to Orbit</button>
      </div>
    );
  }

  const { score, feedback } = reportData;

  // Determine color based on score
  const getScoreColor = () => {
    if (score >= 80) return 'text-[#34c759] drop-shadow-[0_0_20px_rgba(52,199,89,0.8)]';
    if (score >= 60) return 'text-[#ff9f0a] drop-shadow-[0_0_20px_rgba(255,159,10,0.8)]';
    return 'text-[#ff3b30] drop-shadow-[0_0_20px_rgba(255,59,48,0.8)]';
  };

  const getStatusText = () => {
    if (score >= 80) return 'STRONG HIRE';
    if (score >= 60) return 'LEAN HIRE';
    return 'NO HIRE';
  };

  return (
    <div className="w-full min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-5xl mx-auto bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-12 shadow-[0_20px_60px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-bottom-10 duration-1000 relative overflow-hidden">
        
        {/* Inner Edge Highlight */}
        <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>

        {/* Header Section */}
        <div className="flex justify-between items-center border-b border-white/10 pb-8 mb-10 relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-3xl shadow-sm">
              <span className="animate-pulse">📊</span>
            </div>
            <div>
              <h2 className="text-4xl font-bold text-white tracking-tighter">Onyx Final Evaluation</h2>
              <p className="text-[#a1a1a6] font-mono text-sm mt-2 tracking-wide">Target Objective: <span className="text-[#0071e3] font-bold">{targetCompany} Architect</span></p>
            </div>
          </div>
          
          <div className="text-right flex flex-col items-end">
            <div className="bg-black/60 border border-white/10 px-6 py-2.5 rounded-full mb-2 backdrop-blur-md shadow-inner">
              <span className="text-xs font-bold text-[#86868b] uppercase tracking-widest mr-2">Decision: </span>
              <span className={`text-sm font-black tracking-widest ${score >= 60 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                {getStatusText()}
              </span>
            </div>
          </div>
        </div>

        {/* Top Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10 relative z-10">
          
          {/* The Big Score */}
          <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#0071e3] to-transparent opacity-50"></div>
            <span className="text-[#86868b] text-sm font-bold uppercase tracking-widest mb-4">Overall Score</span>
            <div className={`text-8xl font-black tabular-nums tracking-tighter ${getScoreColor()}`}>
              {score}
            </div>
            <span className="text-[#515154] text-sm font-mono mt-2">/ 100</span>
          </div>

          {/* AI Summary */}
          <div className="md:col-span-2 bg-black/40 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 shadow-inner">
            <h3 className="text-white font-bold text-xl mb-4 flex items-center gap-3 tracking-tight">
              <span className="text-[#bf5af2] text-2xl">🧠</span> Lead Architect Notes
            </h3>
            <p className="text-[#a1a1a6] text-lg leading-relaxed font-light italic">
              "{feedback.summary}"
            </p>
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 relative z-10">
          <div className="bg-[#34c759]/5 border border-[#34c759]/20 rounded-[2rem] p-8 backdrop-blur-md">
            <h3 className="text-[#34c759] font-bold text-xl mb-6 flex items-center gap-3 tracking-tight">
              ✅ Technical Strengths
            </h3>
            <ul className="space-y-4">
              {feedback.strengths?.map((item, i) => (
                <li key={i} className="text-[#f5f5f7] text-base font-light flex items-start gap-4 leading-relaxed">
                  <span className="text-[#34c759] mt-1 text-lg">→</span> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-[#ff3b30]/5 border border-[#ff3b30]/20 rounded-[2rem] p-8 backdrop-blur-md">
            <h3 className="text-[#ff3b30] font-bold text-xl mb-6 flex items-center gap-3 tracking-tight">
              ⚠️ Critical Weaknesses
            </h3>
            <ul className="space-y-4">
              {feedback.weaknesses?.map((item, i) => (
                <li key={i} className="text-[#f5f5f7] text-base font-light flex items-start gap-4 leading-relaxed">
                  <span className="text-[#ff3b30] mt-1 text-lg">→</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* BIOMETRIC TELEMETRY BLOCK */}
        {feedback.cognitive_analysis && (
          <div className="bg-[#0071e3]/5 border border-[#0071e3]/20 rounded-[2rem] p-8 mb-10 relative z-10 backdrop-blur-md shadow-inner">
            <h3 className="text-[#0071e3] font-bold text-xl mb-4 flex items-center gap-3 tracking-tight uppercase tracking-widest text-sm font-mono">
              👁️ Visual & Cognitive Inference
            </h3>
            <p className="text-[#f5f5f7] text-lg font-light leading-relaxed">
              {feedback.cognitive_analysis}
            </p>
          </div>
        )}

        {/* Action Footer */}
        <div className="flex justify-between items-center border-t border-white/10 pt-8 mt-10 relative z-10">
          <p className="text-[#515154] text-xs font-mono tracking-wider">Report generated by Onyx Neural Core</p>
          <div className="flex gap-6">
            <button 
              onClick={() => alert('Prathyush will wire this to Supabase later! 🚀')} 
              className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-full transition-colors border border-white/10 backdrop-blur-md"
            >
              Save to Profile
            </button>
            <button 
              onClick={handleFinish} 
              className="px-10 py-4 bg-white hover:bg-[#f5f5f7] text-black font-bold rounded-full transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] hover:scale-105 active:scale-95"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}