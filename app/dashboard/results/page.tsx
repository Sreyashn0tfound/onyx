'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Target, Brain, Zap, CheckCircle2, XCircle, RotateCcw, Home, Activity} from 'lucide-react';

export default function ResultsPage() {
  const router = useRouter();
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    // Yank the report out of local memory since we aren't using the DB right now
    const savedReport = sessionStorage.getItem('onyx_interview_report');
    if (savedReport) {
      setReport(JSON.parse(savedReport));
    }
  }, []);

  if (!report) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-white">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Brain size={40} className="text-gray-600" />
          <p className="font-mono text-xs uppercase tracking-widest text-gray-500">Retrieving Telemetry Data...</p>
        </div>
      </div>
    );
  }

  const isPass = report.score >= 80;
  const mainColor = isPass ? 'text-green-500' : 'text-red-500';
  const glowColor = isPass ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
  const glassClasses = "bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl p-8";

  return (
    <div className="w-full min-h-screen bg-black font-sans text-white overflow-y-auto custom-scrollbar p-10 relative">
      
      {/* Background Glow */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[150px] pointer-events-none" style={{ backgroundColor: glowColor, opacity: 0.5 }}></div>

      <div className="max-w-6xl mx-auto relative z-10">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs font-mono uppercase tracking-widest">
            <ChevronLeft size={16} /> Exit to Orbit
          </button>
          <div className="px-4 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-widest border border-white/20 bg-white/5">
            Onyx Protocol // After-Action Report
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* THE VERDICT (Hero Section) */}
          <div className={`${glassClasses} lg:col-span-1 flex flex-col items-center text-center relative overflow-hidden`} style={{ boxShadow: `0 20px 80px -20px ${glowColor}` }}>
            <h2 className="font-mono text-sm uppercase tracking-widest text-gray-400 mb-8">Overall Assessment</h2>
            
            <div className="relative flex items-center justify-center mb-8">
              <svg className="w-48 h-48 transform -rotate-90">
                <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-gray-800" />
                <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray="550" strokeDashoffset={550 - (550 * report.score) / 100} className={`${mainColor} transition-all duration-1000 ease-out`} />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className={`text-6xl font-bold tracking-tighter ${mainColor}`}>{report.score}</span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-gray-500 mt-1">out of 100</span>
              </div>
            </div>

            <div className={`px-6 py-2 rounded border mb-6 ${isPass ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
              <h3 className="font-bold tracking-widest uppercase text-lg">{isPass ? 'FAANG-Ready' : 'Rejected'}</h3>
            </div>

            <p className="text-gray-300 text-sm leading-relaxed mb-8">{report.summary}</p>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            
            {/* BIOMETRICS */}
            <div className={`${glassClasses} flex flex-col gap-6`}>
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <Activity className="text-purple-500" size={20} />
                <h2 className="font-bold uppercase tracking-widest text-white">Biometric Telemetry</h2>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-[#111] rounded-xl p-5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2 text-gray-400"><Target size={16}/> <span className="font-mono text-xs uppercase tracking-widest">Hesitation Index</span></div>
                  <div className="text-3xl font-bold text-white mb-1">{report.biometrics?.hesitationCount || 0} <span className="text-sm font-normal text-gray-500">flags</span></div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Umms, ahhs, and filler words</p>
                </div>
                <div className="bg-[#111] rounded-xl p-5 border border-white/5">
                  <div className="flex items-center gap-2 mb-2 text-gray-400"><Zap size={16}/> <span className="font-mono text-xs uppercase tracking-widest">Max Latency</span></div>
                  <div className="text-3xl font-bold text-white mb-1">{((report.biometrics?.maxLatency || 0) / 1000).toFixed(1)} <span className="text-sm font-normal text-gray-500">sec</span></div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Longest pause before answering</p>
                </div>
              </div>

              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 flex gap-4 items-start">
                <Brain className="text-purple-400 shrink-0 mt-1" size={20} />
                <div>
                  <h4 className="text-xs font-mono uppercase tracking-widest text-purple-400 mb-1">Cognitive Analysis</h4>
                  <p className="text-sm text-gray-300 leading-relaxed">{report.cognitive_analysis || "Candidate exhibited stable cognitive load during questioning."}</p>
                </div>
              </div>
            </div>

            {/* STRENGTHS & WEAKNESSES */}
            <div className="grid grid-cols-2 gap-6">
              <div className={`${glassClasses} flex flex-col gap-4 border-t-2 border-t-green-500`}>
                <h3 className="font-bold uppercase tracking-widest text-green-500 flex items-center gap-2"><CheckCircle2 size={18}/> Strengths</h3>
                <ul className="space-y-3">
                  {report.strengths?.map((strength: string, i: number) => (
                    <li key={i} className="text-sm text-gray-300 leading-relaxed pl-4 relative before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:bg-green-500 before:rounded-full">{strength}</li>
                  ))}
                </ul>
              </div>
              
              <div className={`${glassClasses} flex flex-col gap-4 border-t-2 border-t-red-500`}>
                <h3 className="font-bold uppercase tracking-widest text-red-500 flex items-center gap-2"><XCircle size={18}/> Weaknesses</h3>
                <ul className="space-y-3">
                  {report.weaknesses?.map((weakness: string, i: number) => (
                    <li key={i} className="text-sm text-gray-300 leading-relaxed pl-4 relative before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:bg-red-500 before:rounded-full">{weakness}</li>
                  ))}
                </ul>
              </div>
            </div>

          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-12 flex justify-center gap-6">
          <button onClick={() => router.push('/dashboard')} className="px-8 py-4 rounded-xl bg-[#111] hover:bg-[#222] border border-white/10 text-white font-bold uppercase tracking-widest transition-all flex items-center gap-3">
            <Home size={18} /> Return to Dashboard
          </button>
          <button onClick={() => router.back()} className="px-8 py-4 rounded-xl text-black font-bold uppercase tracking-widest transition-all hover:scale-[1.05] active:scale-95 flex items-center gap-3 bg-white">
            <RotateCcw size={18} /> Try Again
          </button>
        </div>

      </div>
    </div>
  );
}