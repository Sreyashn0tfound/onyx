'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Play, Loader2, Zap, CheckCircle2, XCircle, FileText, Terminal, Activity, ChevronRight } from 'lucide-react';
import Editor from '@monaco-editor/react';

// Import actions
import { generateArenaQuestionAction, gradeAssignmentAction } from '@/app/actions';

export default function ArenaCodePage() {
  const router = useRouter();
  const [elo, setElo] = useState<number>(1000);
  const [difficulty, setDifficulty] = useState<string>('Unknown');
  
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [code, setCode] = useState<string>("# Defy the Event Horizon...\n");
  const [isLoading, setIsLoading] = useState(true);
  
  const [isGrading, setIsGrading] = useState(false);
  const [gradeResult, setGradeResult] = useState<any>(null);
  const [eloChange, setEloChange] = useState<{points: number, isPositive: boolean} | null>(null);

  // Liquid UI Glass Classes
  const paneClasses = "bg-white/[0.02] backdrop-blur-3xl border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative z-10";

  useEffect(() => {
    const savedElo = parseInt(localStorage.getItem('onyx_elo') || '1000');
    setElo(savedElo);

    const targetDifficulty = sessionStorage.getItem('onyx_arena_difficulty') || 'Optimization (Medium)';
    setDifficulty(targetDifficulty);
    
    // Fetch the question immediately on load
    fetchQuestion(targetDifficulty);
  }, []);

  const fetchQuestion = async (level: string) => {
    setIsLoading(true);
    const res = await generateArenaQuestionAction(level);
    if (res.success) {
      setActiveQuestion(res.question);
      setCode(`# Objective: ${res.question.title}\n# Difficulty: ${level}\n\ndef solution():\n    pass\n`);
    } else {
      alert("Failed to stabilize connection to the Black Hole.");
      router.back();
    }
    setIsLoading(false);
  };

  // 🔥 THE NEW ENDLESS LOOP FUNCTION
  const handleNextQuestion = () => {
    setGradeResult(null);
    setEloChange(null);
    setCode("# Defy the Event Horizon...\n");
    fetchQuestion(difficulty);
  };

  const updateElo = (points: number, isPositive: boolean) => {
    const newElo = elo + points;
    setElo(newElo);
    localStorage.setItem('onyx_elo', newElo.toString());
    setEloChange({ points: Math.abs(points), isPositive });
  };

  const submitCode = async () => {
    if (!activeQuestion) return;
    setIsGrading(true);
    setGradeResult(null);
    setEloChange(null);

    const res = await gradeAssignmentAction(code, activeQuestion.prompt, "FAANG Arena");
    
    if (res.success && res.result) {
      setGradeResult(res.result);
      if (res.result.passed) {
        let points = 10;
        if (difficulty.includes('Medium')) points = 25;
        if (difficulty.includes('Hard')) points = 50;
        
        // Time Complexity Bonus
        if (res.result.metrics?.timeComplexity?.includes('O(1)') || res.result.metrics?.timeComplexity?.includes('O(n)')) {
          points += 15; 
        }
        updateElo(points, true);
      } else {
        let penalty = -5;
        if (difficulty.includes('Medium')) penalty = -15;
        if (difficulty.includes('Hard')) penalty = -30;
        updateElo(penalty, false);
      }
    }
    setIsGrading(false);
  };

  const difficultyColor = difficulty.includes('Easy') ? 'text-green-400 border-green-400/30 bg-green-400/10' : 
                          difficulty.includes('Medium') ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10' : 
                          'text-red-400 border-red-400/30 bg-red-400/10';

  return (
    <div className="w-full h-screen bg-[#020202] font-sans text-white flex flex-col relative overflow-hidden">
      
      {/* TRANSLUCENT LIQUID BACKGROUND ORBS */}
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-purple-700/20 rounded-full mix-blend-screen filter blur-[100px] opacity-50 animate-[blob_7s_infinite]"></div>
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-700/20 rounded-full mix-blend-screen filter blur-[100px] opacity-50 animate-[blob_7s_infinite_2s]"></div>
      <div className="absolute -bottom-32 left-1/2 w-[800px] h-[800px] bg-indigo-700/20 rounded-full mix-blend-screen filter blur-[120px] opacity-50 animate-[blob_7s_infinite_4s]"></div>

      {/* TOP NAVBAR */}
      <div className="h-16 border-b border-white/10 bg-black/20 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 relative z-20">
        <button onClick={() => router.push('/dashboard/arena')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-mono uppercase tracking-widest">
          <ChevronLeft size={16} /> Lobby
        </button>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5">
            <Activity size={14} className="text-purple-500" />
            <span className="font-mono text-xs uppercase tracking-widest text-gray-300">Onyx Elo:</span>
            <span className="font-mono font-bold text-sm text-purple-400">{elo}</span>
          </div>
          
          {/* 🔥 DYNAMIC NAVBAR BUTTONS */}
          <div className="flex items-center gap-3">
            {gradeResult && !gradeResult.passed && (
              <button 
                onClick={handleNextQuestion}
                disabled={isLoading || isGrading}
                className="px-4 py-2 rounded-full border border-white/10 text-gray-400 font-bold text-xs uppercase tracking-widest transition-all hover:bg-white/10 hover:text-white"
              >
                Skip
              </button>
            )}

            {gradeResult?.passed ? (
              <button 
                onClick={handleNextQuestion} 
                disabled={isLoading}
                className="px-6 py-2 rounded-full bg-purple-600 text-white font-bold text-xs uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-[0_0_20px_rgba(168,85,247,0.4)]"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} className="fill-white" />}
                Next Anomaly
              </button>
            ) : (
              <button 
                onClick={submitCode} 
                disabled={isGrading || isLoading}
                className="px-6 py-2 rounded-full bg-white text-black font-bold text-xs uppercase tracking-widest transition-all hover:scale-105 active:scale-95 flex items-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
              >
                {isGrading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} className="fill-black" />}
                {isGrading ? "Evaluating..." : gradeResult ? "Retry Submission" : "Run & Submit"}
              </button>
            )}
          </div>

        </div>
      </div>

      {/* MAIN SPLIT SCREEN */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden relative z-10">
        
        {/* LEFT PANE: DESCRIPTION */}
        <div className={`w-[40%] ${paneClasses}`}>
          <div className="h-12 border-b border-white/10 bg-white/5 flex items-center px-4 gap-2 shrink-0">
            <FileText size={16} className="text-gray-400" />
            <span className="font-mono text-xs uppercase tracking-widest text-gray-300">Problem Description</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {isLoading ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-4">
                <Loader2 size={32} className="animate-spin text-purple-500" />
                <span className="font-mono text-xs uppercase tracking-widest">Materializing Anomaly...</span>
              </div>
            ) : activeQuestion ? (
              <div className="animate-in fade-in duration-700">
                <h1 className="text-3xl font-bold tracking-tight mb-4 text-white">{activeQuestion.title}</h1>
                <div className={`inline-block px-3 py-1 rounded-full border font-mono text-[10px] uppercase tracking-widest mb-8 ${difficultyColor}`}>
                  {difficulty}
                </div>
                <div className="prose prose-invert prose-p:text-gray-300 prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-pre:p-4 prose-pre:rounded-xl">
                   <p dangerouslySetInnerHTML={{ __html: activeQuestion.prompt?.replace(/\n/g, '<br/>') }} />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT PANE: EDITOR & CONSOLE */}
        <div className="w-[60%] flex flex-col gap-4">
          
          {/* EDITOR */}
          <div className={`flex-1 ${paneClasses}`}>
            <div className="h-12 border-b border-white/10 bg-white/5 flex items-center px-4 gap-2 shrink-0">
              <Zap size={16} className="text-blue-400" />
              <span className="font-mono text-xs uppercase tracking-widest text-gray-300">Solution.py</span>
            </div>
            <div className="flex-1 bg-[#050505]/50 relative">
            <Editor 
                height="100%" 
                defaultLanguage="python" 
                theme="vs-dark" 
                value={code} 
                onChange={(val) => setCode(val || '')}
                options={{ 
                  minimap: { enabled: false }, 
                  fontSize: 15,
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: { top: 20 }
                  // 🔥 Removed the invalid background property here!
                }} 
              /> 
            </div>
          </div>

          {/* CONSOLE / OUTPUT */}
          <div className={`h-[250px] shrink-0 ${paneClasses}`}>
            <div className="h-12 border-b border-white/10 bg-white/5 flex items-center px-4 gap-2 shrink-0">
              <Terminal size={16} className="text-gray-400" />
              <span className="font-mono text-xs uppercase tracking-widest text-gray-300">Test Console</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-black/40">
              {!gradeResult && !isGrading && (
                <div className="text-gray-500 font-mono text-sm">Awaiting execution...</div>
              )}
              
              {isGrading && (
                <div className="text-purple-400 font-mono text-sm flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin" /> Compiling through the AST matrix...
                </div>
              )}

              {gradeResult && (
                <div className="animate-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3 mb-4">
                    {gradeResult.passed ? <CheckCircle2 size={24} className="text-green-500"/> : <XCircle size={24} className="text-red-500"/>}
                    <h3 className={`text-lg font-bold uppercase tracking-widest ${gradeResult.passed ? 'text-green-500' : 'text-red-500'}`}>
                      {gradeResult.passed ? 'Accepted' : 'Failed'}
                    </h3>
                  </div>
                  
                  <p className="text-gray-300 text-sm leading-relaxed mb-4">{gradeResult.feedback}</p>
                  
                  {gradeResult.metrics && (
                    <div className="flex gap-6 border-t border-white/10 pt-4 mt-2">
                      <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                         <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest block mb-1">Time Complexity</span>
                         <span className="text-blue-400 font-mono text-sm">{gradeResult.metrics.timeComplexity}</span>
                      </div>
                      <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                         <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest block mb-1">Space Complexity</span>
                         <span className="text-blue-400 font-mono text-sm">{gradeResult.metrics.spaceComplexity}</span>
                      </div>
                    </div>
                  )}

                  {eloChange && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border font-mono text-xs font-bold uppercase tracking-widest animate-pulse ${eloChange.isPositive ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-red-500/20 border-red-500/50 text-red-400'}`}>
                         {eloChange.isPositive ? 'Rank Up: +' : 'Rank Down: -'}{eloChange.points} ELO
                      </div>
                      
                      {/* 🔥 BIG TERMINAL NEXT BUTTON */}
                      {gradeResult.passed && (
                        <button 
                          onClick={handleNextQuestion}
                          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                        >
                          <Zap size={14} className="fill-white" /> Next Anomaly <ChevronRight size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}