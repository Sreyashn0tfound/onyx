'use client';

import { useState, useEffect } from 'react';
import { 
  Play, 
  Code2, 
  Bot, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle, 
  Send, 
  Loader2, 
  ChevronLeft,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import Editor from '@monaco-editor/react';

export default function AmazonAIAssessment({ onExit }: { onExit: () => void }) {
  const [incident, setIncident] = useState<any>(null);
  const [code, setCode] = useState<string>('');
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<string>('Terminal initialized. Awaiting test execution.');
  const [isPatchSubmitted, setIsPatchSubmitted] = useState(false);

  const glassClasses = `bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl`;

  // Fetch initial incident data
  useEffect(() => {
    async function loadIncident() {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/amazon/incident');
        const data = await res.json();
        setIncident(data);
        setCode(data.starter_code);
        setAiMessages([
          {
            role: 'ai',
            text: `Connected to Amazon Q Internal Companion. I have indexed the \`${data.title}\` repository. Ask me anything about the data structures or request edge-case fixes.`
          }
        ]);
      } catch {
        // Fallback demo data if backend isn't ready
        setIncident({
          incident_id: 'prime_routing',
          title: 'Prime Locker Dynamic Allocation Service',
          description: 'The routing engine crashes when incoming packages exceed locker volume or contain negative weight telemetry. Must run in O(N log N) or better.',
          starter_code: `def allocate_lockers(packages, locker_capacities):\n    # packages: list of dicts [{'id': 'pkg_1', 'weight': 12}]\n    # locker_capacities: list of ints [10, 20, 50]\n    allocations = {}\n    for pkg in packages:\n        if pkg['weight'] <= 0:\n            continue\n        for i, cap in enumerate(sorted(locker_capacities)):\n            if pkg['weight'] <= cap:\n                allocations[pkg['id']] = i\n                break\n        if pkg['id'] not in allocations:\n            allocations[pkg['id']] = -1\n    return allocations`
        });
      }
    }
    loadIncident();
  }, []);

  const handleAskAI = async () => {
    if (!aiInput.trim() || isAiThinking) return;
    const prompt = aiInput.trim();
    setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: prompt }]);
    setIsAiThinking(true);

    try {
      const res = await fetch('http://127.0.0.1:8000/api/amazon/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_prompt: prompt,
          current_code: code,
          incident_id: incident?.incident_id || 'prime_routing'
        })
      });
      const data = await res.json();
      setAiMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch {
      setAiMessages(prev => [...prev, { 
        role: 'ai', 
        text: 'To avoid O(N*M) nested scanning, sort `locker_capacities` and use binary search (`bisect_left`). Make sure to filter `pkg["weight"] <= 0` at the very top.' 
      }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleRunTests = async () => {
    setIsRunningTests(true);
    setTerminalLogs('Compiling AST and executing unit test matrix...\n');

    try {
      const res = await fetch('http://127.0.0.1:8000/api/amazon/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          incident_id: incident?.incident_id || 'prime_routing'
        })
      });

      const data = await res.json();
      if (!data.success) {
        setTerminalLogs(`EXECUTION FAILED:\n${data.error}`);
        setTestResults([]);
      } else {
        setTestResults(data.results);
        const logLines = data.results.map((r: any) => 
          r.passed 
            ? `[PASS] ${r.name} -> OK` 
            : `[FAIL] ${r.name} -> Expected: ${r.expected}, Received: ${r.actual || r.error}`
        ).join('\n');
        
        setTerminalLogs(`Test Suite Execution Complete:\n\n${logLines}\n\nStatus: ${data.all_passed ? 'ALL SUITES GREEN (100%)' : 'EDGE CASE REGRESSIONS DETECTED'}`);
      }
    } catch {
      setTerminalLogs('Test runner connection lost. Retrying...');
    } finally {
      setIsRunningTests(false);
    }
  };

  return (
    <div className="w-full h-screen bg-black text-white p-6 flex flex-col font-sans overflow-hidden absolute inset-0 z-50">
      
      {/* TOP HEADER */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={onExit} 
            className="flex items-center gap-1.5 text-xs font-mono text-gray-400 hover:text-white transition-colors uppercase tracking-widest"
          >
            <ChevronLeft size={16} /> Orbit Map
          </button>
          <div className="h-4 w-[1px] bg-white/20" />
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff9900] animate-pulse" />
            <h1 className="text-sm font-bold uppercase tracking-widest font-mono text-white">
              Amazon SDE Crucible <span className="text-[#ff9900]">// AI-Assisted Assessment</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <ShieldCheck size={14} className="text-[#ff9900]" /> Evaluation: Prompt Validation
          </span>
          <button 
            onClick={() => setIsPatchSubmitted(true)}
            className="px-4 py-1.5 bg-[#ff9900] hover:bg-[#ff9900]/90 text-black font-bold uppercase tracking-widest text-xs font-mono rounded-lg transition-all shadow-[0_0_20px_rgba(255,153,0,0.3)]"
          >
            Submit Production Patch
          </button>
        </div>
      </div>

      {/* 3-PANE WORKSPACE */}
      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        
        {/* PANE 1: INCIDENT & TEST HARNESS */}
        <div className={`${glassClasses} w-[340px] flex flex-col p-4 shrink-0`}>
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/10 text-[#ff9900]">
            <AlertTriangle size={16} />
            <h2 className="font-bold text-xs font-mono uppercase tracking-widest">Active Sev-2 Incident</h2>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar text-xs font-mono space-y-3 pr-1">
            <div className="bg-white/5 p-3 rounded-xl border border-white/5">
              <h3 className="text-white font-bold mb-1">{incident?.title || 'Loading incident...'}</h3>
              <p className="text-gray-400 leading-relaxed text-[11px]">{incident?.description}</p>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Verification Criteria</span>
              <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/5 text-[11px] text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Filter negative payloads
              </div>
              <div className="flex items-center gap-2 bg-black/40 p-2 rounded-lg border border-white/5 text-[11px] text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                O(N log N) Runtime limit
              </div>
            </div>
          </div>

          {/* TEST RESULTS & TERMINAL */}
          <div className="h-[220px] border-t border-white/10 pt-3 flex flex-col shrink-0 mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-gray-400 uppercase flex items-center gap-1.5">
                <Terminal size={12} /> Execution Harness
              </span>
              <button 
                onClick={handleRunTests}
                disabled={isRunningTests}
                className="px-2.5 py-1 bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 text-green-400 rounded text-[10px] font-mono uppercase flex items-center gap-1 transition-all disabled:opacity-50"
              >
                {isRunningTests ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />} Run Tests
              </button>
            </div>
            
            <div className="flex-1 bg-[#050505] rounded-xl border border-white/5 p-3 font-mono text-[10px] text-gray-300 whitespace-pre-wrap overflow-y-auto custom-scrollbar">
              {terminalLogs}
            </div>
          </div>
        </div>

        {/* PANE 2: MONACO IDE */}
        <div className={`${glassClasses} flex-1 flex flex-col p-3 min-w-0 border-[#ff9900]/20`}>
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 px-2">
            <div className="flex items-center gap-2">
              <Code2 size={16} className="text-[#ff9900]" />
              <span className="font-mono text-xs uppercase tracking-widest text-white">locker_allocator.py</span>
            </div>
            <span className="text-[10px] font-mono text-gray-500">Python 3.11</span>
          </div>

          <div className="flex-1 rounded-xl overflow-hidden border border-white/5">
            <Editor 
              height="100%" 
              defaultLanguage="python" 
              theme="vs-dark" 
              value={code} 
              onChange={(val) => setCode(val || '')} 
              options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'JetBrains Mono, monospace', padding: { top: 12 } }} 
            />
          </div>
        </div>

        {/* PANE 3: AMAZON Q AI COMPANION */}
        <div className={`${glassClasses} w-[380px] flex flex-col p-4 shrink-0`}>
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-blue-400">
              <Bot size={16} />
              <h2 className="font-bold text-xs font-mono uppercase tracking-widest text-white">Amazon Q Companion</h2>
            </div>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              Online
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar text-xs font-mono pr-1">
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <span className="text-[9px] text-gray-500 uppercase tracking-widest mb-1">
                  {msg.role === 'user' ? 'Candidate' : 'Amazon Q'}
                </span>
                <div 
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' 
                      ? 'bg-white/10 text-white rounded-br-none' 
                      : 'bg-[#111] text-gray-200 border border-white/10 rounded-bl-none shadow-lg'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {isAiThinking && (
              <div className="text-[11px] font-mono text-blue-400 flex items-center gap-2 animate-pulse">
                <Sparkles size={12} /> Synthesizing code recommendation...
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-white/10 mt-2">
            <input 
              type="text" 
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
              disabled={isAiThinking}
              placeholder="Prompt Amazon Q for help..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-blue-500/50 placeholder:text-gray-600 disabled:opacity-50"
            />
            <button 
              onClick={handleAskAI}
              disabled={!aiInput.trim() || isAiThinking}
              className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </div>

      </div>

      {/* DEMO FINALE MODAL */}
      {isPatchSubmitted && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-[500px] bg-[#0a0a0a] border border-white/15 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#ff9900]/10 border border-[#ff9900]/30 flex items-center justify-center mb-4">
              <CheckCircle2 size={32} className="text-[#ff9900]" />
            </div>
            <h2 className="text-xl font-bold uppercase tracking-wider text-white mb-2">Patch Verified & Deployed</h2>
            <p className="text-xs font-mono text-gray-400 mb-6 leading-relaxed">
              Candidate demonstrated strong <strong>Customer Obsession</strong> and <strong>Dive Deep</strong> by filtering corrupted payloads before hot-patching.
            </p>

            <button 
              onClick={onExit}
              className="w-full py-3.5 bg-white text-black font-bold uppercase tracking-widest text-xs font-mono rounded-xl hover:bg-gray-200 transition-colors"
            >
              Return to Orbital Legend
            </button>
          </div>
        </div>
      )}

    </div>
  );
}