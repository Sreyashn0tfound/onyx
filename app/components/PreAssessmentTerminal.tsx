'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShieldAlert, 
  Timer, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Radio, 
  Lock 
} from 'lucide-react';

export interface Question {
  id: number;
  category: string; // e.g. "React Architecture", "Big-O & Memory", "State Sync"
  question: string;
  codeSnippet?: string;
  options: string[];
  correctIndex: number;
}

interface PreAssessmentProps {
  targetRole: string;
  onComplete: (data: {
    score: number;
    telemetry: {
      violations: number;
      timeSpentSeconds: number;
      categoryBreakdown: Record<string, { total: number; correct: number }>;
      averageSecondsPerQuestion: number;
    };
  }) => void;
}

// Sample fallback questions (Dynamic generation will supply these via Server Action)
const SAMPLE_QUESTIONS: Question[] = [
  {
    id: 1,
    category: "General Computing & Big-O",
    question: "What is the worst-case time complexity of searching for an element in an unsorted array of size N using binary search?",
    options: [
      "O(log N)",
      "O(1)",
      "O(N) - Binary Search cannot be applied to an unsorted array",
      "O(N log N)"
    ],
    correctIndex: 2
  },
  {
    id: 2,
    category: "Memory & Concurrency",
    question: "Which data structure is best suited for implementing an LRU (Least Recently Used) cache with O(1) average lookup and eviction?",
    options: [
      "Hash Map + Doubly Linked List",
      "Binary Search Tree + Queue",
      "Dynamic Array + Binary Heap",
      "Singly Linked List + Stack"
    ],
    correctIndex: 0
  },
  {
    id: 3,
    category: "Architecture & Systems",
    question: "Identify the critical flaw in this state update sequence:",
    codeSnippet: "function updateMetrics(delta) {\n  let current = getScore();\n  setTimeout(() => {\n    saveScore(current + delta);\n  }, 500);\n}",
    options: [
      "Syntax error in setTimeout invocation",
      "Stale closure / race condition if updateMetrics runs concurrently",
      "Memory leak caused by unreferenced delta parameter",
      "Stack overflow caused by recursive invocation"
    ],
    correctIndex: 1
  }
];

export default function PreAssessmentTerminal({ targetRole, onComplete }: PreAssessmentProps) {
  const TOTAL_TIME = 15 * 60; // 15 Minutes in seconds
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME);
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  
  // Anti-Cheat & Telemetry States
  const [violations, setViolations] = useState(0);
  const [violationWarning, setViolationWarning] = useState<string | null>(null);
  const questionStartTime = useRef<number>(Date.now());
  const questionLatencies = useRef<number[]>([]);

  // 1. Anti-Cheat: Shortcut Blocking & Copy/Paste Disabler
  useEffect(() => {
    if (!started) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Block F12, Ctrl+Shift+I, Ctrl+C, Ctrl+V, Ctrl+U
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'u' || e.key === 'C' || e.key === 'V'))
      ) {
        e.preventDefault();
        triggerViolation("Unauthorized shortcut execution blocked.");
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerViolation("Context menu inspection blocked.");
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [started]);

  // 2. Anti-Cheat: Visibility & Focus Blur Detection (Tab Switching)
  useEffect(() => {
    if (!started) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation("Focus lost: Window defocus or tab-switch detected.");
      }
    };

    const handleBlur = () => {
      triggerViolation("Focus lost: Candidate left the terminal viewport.");
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [started]);

  // 3. Countdown Timer
  useEffect(() => {
    if (!started) return;

    if (timeLeft <= 0) {
      handleFinalSubmission();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [started, timeLeft]);

  const triggerViolation = (msg: string) => {
    setViolations(prev => prev + 1);
    setViolationWarning(msg);
    setTimeout(() => setViolationWarning(null), 3500);
  };

  const handleStart = () => {
    // Attempt fullscreen trigger
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (_) {}

    questionStartTime.current = Date.now();
    setStarted(true);
  };

  const handleSelectOption = (optionIndex: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [currentIndex]: optionIndex
    }));
  };

  const handleNext = () => {
    // Record question time latency
    const elapsed = (Date.now() - questionStartTime.current) / 1000;
    questionLatencies.current.push(elapsed);
    questionStartTime.current = Date.now();

    if (currentIndex < SAMPLE_QUESTIONS.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      handleFinalSubmission();
    }
  };

  const handleFinalSubmission = () => {
    // Compute Score and Category Telemetry
    let totalScore = 0;
    const categoryBreakdown: Record<string, { total: number; correct: number }> = {};

    SAMPLE_QUESTIONS.forEach((q, idx) => {
      const selected = selectedAnswers[idx];
      const isCorrect = selected === q.correctIndex;

      if (!categoryBreakdown[q.category]) {
        categoryBreakdown[q.category] = { total: 0, correct: 0 };
      }
      categoryBreakdown[q.category].total += 1;

      if (isCorrect) {
        totalScore += Math.round(100 / SAMPLE_QUESTIONS.length);
        categoryBreakdown[q.category].correct += 1;
      }
    });

    // Penalize score if critical violations occurred
    const penalty = Math.min(violations * 5, 25);
    const finalScore = Math.max(0, totalScore - penalty);

    const avgLatency = questionLatencies.current.length > 0
      ? questionLatencies.current.reduce((a, b) => a + b, 0) / questionLatencies.current.length
      : 0;

    onComplete({
      score: finalScore,
      telemetry: {
        violations,
        timeSpentSeconds: TOTAL_TIME - timeLeft,
        categoryBreakdown,
        averageSecondsPerQuestion: parseFloat(avgLatency.toFixed(1))
      }
    });
  };

  const formattedTime = useMemo(() => {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [timeLeft]);

  const currentQ = SAMPLE_QUESTIONS[currentIndex];

  return (
    <div className="w-full min-h-screen bg-black text-white flex items-center justify-center p-6 select-none font-sans relative overflow-hidden">
      
      {/* Background Subtle Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(10,132,255,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* STRIKE / VIOLATION WARNING BANNER */}
      {violationWarning && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-red-500/20 border border-red-500/50 backdrop-blur-xl px-6 py-3 rounded-full flex items-center gap-3 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-in fade-in slide-in-from-top-4">
          <AlertTriangle className="text-red-400 w-4 h-4" />
          <span className="text-xs font-mono uppercase tracking-widest text-red-300">
            {violationWarning} (Strikes: {violations})
          </span>
        </div>
      )}

      {/* 1. PRE-START BRIEFING SCREEN */}
      {!started ? (
        <div className="max-w-xl w-full bg-[#0a0a0a]/90 border border-white/10 p-10 rounded-[2rem] shadow-2xl backdrop-blur-2xl text-center animate-in fade-in zoom-in-95 duration-500 relative z-10">
          <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(10,132,255,0.2)]">
            <Lock className="w-6 h-6 text-[#0a84ff]" />
          </div>

          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#0a84ff] block mb-2">Protocol Intake</span>
          <h1 className="text-3xl font-bold uppercase tracking-tight mb-3">Diagnostic Gauntlet</h1>
          <p className="text-gray-400 text-xs leading-relaxed mb-8">
            This 15-minute diagnostic will calculate your baseline telemetry for the <strong className="text-white">{targetRole}</strong> track. Your scores determine curriculum scaling and difficulty curve.
          </p>

          <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-8 text-left space-y-3 font-mono text-[11px] text-gray-300">
            <div className="flex items-center gap-3 text-red-400">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Anti-Cheat active: Fullscreen enforcement & defocus detection enabled.</span>
            </div>
            <div className="flex items-center gap-3 text-gray-400">
              <Timer className="w-4 h-4 shrink-0" />
              <span>Total Time: 15:00 (Auto-terminates upon expiration).</span>
            </div>
          </div>

          <button
            onClick={handleStart}
            className="w-full py-4 bg-white text-black rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-gray-200 transition-all hover:scale-[1.01] active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.15)]"
          >
            Engage Neural Triage
          </button>
        </div>
      ) : (
        /* 2. THE ACTIVE TERMINAL VIEWPORT */
        <div className="max-w-3xl w-full bg-[#0a0a0a]/90 border border-white/10 rounded-[2rem] p-8 shadow-2xl backdrop-blur-2xl flex flex-col relative z-10 animate-in fade-in duration-300">
          
          {/* Header Controls */}
          <div className="flex items-center justify-between border-b border-white/10 pb-6 mb-8">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-[#0a84ff]" />
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500 block">Active Protocol</span>
                <span className="text-sm font-bold uppercase tracking-tight text-white">{currentQ.category}</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full font-mono text-xs text-white">
                <Timer className="w-4 h-4 text-[#bf5af2]" />
                <span className={timeLeft < 180 ? 'text-red-400 animate-pulse' : 'text-gray-200'}>
                  {formattedTime}
                </span>
              </div>
              <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                Node {currentIndex + 1} / {SAMPLE_QUESTIONS.length}
              </span>
            </div>
          </div>

          {/* Question Prompt */}
          <div className="mb-6">
            <h2 className="text-lg font-medium text-white leading-relaxed mb-4">
              {currentQ.question}
            </h2>

            {currentQ.codeSnippet && (
              <pre className="bg-[#050505] border border-white/10 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto leading-relaxed mb-6">
                <code>{currentQ.codeSnippet}</code>
              </pre>
            )}
          </div>

          {/* Answer Options */}
          <div className="space-y-3 mb-8">
            {currentQ.options.map((opt, idx) => {
              const isSelected = selectedAnswers[currentIndex] === idx;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectOption(idx)}
                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between text-xs font-mono ${
                    isSelected 
                      ? 'bg-blue-500/10 border-blue-500/50 text-white shadow-[0_0_20px_rgba(10,132,255,0.15)]' 
                      : 'bg-white/5 border-white/5 text-gray-300 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${
                      isSelected ? 'border-blue-400 bg-blue-500 text-black font-bold' : 'border-gray-600 text-gray-400'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span>{opt}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                </button>
              );
            })}
          </div>

          {/* Footer Submit / Advance Controls */}
          <div className="flex justify-between items-center pt-6 border-t border-white/10 mt-auto">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-gray-500">
              <Radio className="w-3 h-3 text-green-400 animate-pulse" />
              <span>Telemetry Sync Active</span>
            </div>

            <button
              onClick={handleNext}
              disabled={selectedAnswers[currentIndex] === undefined}
              className="px-8 py-3 bg-white text-black rounded-xl font-bold uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-gray-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95 shadow-[0_0_25px_rgba(255,255,255,0.1)]"
            >
              <span>{currentIndex === SAMPLE_QUESTIONS.length - 1 ? "Transmit Telemetry" : "Next Objective"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      )}

    </div>
  );
}