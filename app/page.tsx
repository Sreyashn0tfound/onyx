'use client';

import Editor from '@monaco-editor/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase'; 

import { generateRoadmapAction, gradeAssignmentAction, evaluateInterviewAction, getYouTubeVideoAction, getUserRoadmapAction, saveCodeSubmissionAction } from './actions'; 
import dynamic from 'next/dynamic';

const PostInterviewReport = dynamic(() => import('./components/PostInterviewReport'), { ssr: false });

interface DynamicVoiceProps { targetRole: string; onInterviewComplete: (transcript: any[], biometrics?: any) => void; isGeneralHR?: boolean; }
const VoiceInterview = dynamic<DynamicVoiceProps>(() => import('./components/VoiceInterview'), { ssr: false, loading: () => <div className="p-8 text-blue-500 font-mono animate-pulse flex items-center justify-center h-64 border border-white/10 rounded-[2rem] bg-[#0a0a0a]/60 backdrop-blur-3xl">Booting Onyx AI...</div> });

const GauntletCanvas = dynamic(() => import('./components/GauntletCanvas'), { 
  ssr: false, 
  loading: () => (
    <div className="w-full h-[600px] bg-[#0a0a0a]/40 rounded-[3rem] border border-white/10 flex items-center justify-center shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
      <div className="text-[#86868b] uppercase tracking-widest text-sm font-mono animate-pulse font-bold">Initializing Spatial Engine...</div>
    </div>
  ) 
});

interface JobProfile { title: string; description: string; expectedSalary: string; requiredSkills: string[]; }
interface Level { id: number; title: string; description: string; notes: string; youtube_search_term: string; assignment_prompt: string; }
interface Module { module_id: number; module_title: string; module_description: string; chapters: Level[]; }
interface LearningResources { free_track: any[]; premium_track: any[]; }

export default function StudentOnboarding() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push('/login');
      } else {
        setUser(session.user);
      }
    };

    checkUser();
  }, [router]);

  const [formData, setFormData] = useState({ degree: '', currentYear: '3rd Year', targetCompany: '', targetRole: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [jobProfile, setJobProfile] = useState<JobProfile | null>(null);
  const [modules, setModules] = useState<Module[] | null>(null);
  const [learningResources, setLearningResources] = useState<LearningResources | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [highestUnlockedIndex, setHighestUnlockedIndex] = useState(0); 
  const [selectedLevelIndex, setSelectedLevelIndex] = useState<number | null>(null); 
  const [isInterviewUnlocked, setIsInterviewUnlocked] = useState(false);
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  
  const [showInterview, setShowInterview] = useState(false); 
  const [showGeneralHR, setShowGeneralHR] = useState(false); 
  
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [interviewReport, setInterviewReport] = useState<any>(null);
  const [studentAnswer, setStudentAnswer] = useState("// Write your solution here...\n");
  const [isGrading, setIsGrading] = useState(false);
  const [graderFeedback, setGraderFeedback] = useState<any>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return; 

    const loadSavedRoadmap = async () => {
      const response = await getUserRoadmapAction(user.id);
      
      if (response.success && response.roadmap) {
        setJobProfile({
          title: response.roadmap.title,
          description: response.roadmap.description,
          expectedSalary: response.roadmap.expectedSalary,
          requiredSkills: response.roadmap.requiredSkills
        });

        const roleSplit = response.roadmap.title.split(' at ');
        setFormData(prev => ({
          ...prev,
          targetRole: roleSplit[0] || 'Target Role',
          targetCompany: roleSplit[1] || 'Target Company'
        }));

        const reconstructedModules: Module[] = [];
        const flatLevels: Level[] = [];

        response.roadmap.nodes.forEach((node: any) => {
          const levelObj: Level = {
            id: node.sequenceIndex,
            title: node.chapterTitle,
            description: node.phaseTitle,
            notes: node.notes,
            youtube_search_term: node.youtubeSearchTerm,
            assignment_prompt: node.assignmentPrompt
          };
          
          flatLevels.push(levelObj);

          let existingMod = reconstructedModules.find(m => m.module_title === node.phaseTitle);
          if (!existingMod) {
            existingMod = {
              module_id: reconstructedModules.length + 1,
              module_title: node.phaseTitle,
              module_description: `Phase ${reconstructedModules.length + 1} of your technical journey.`,
              chapters: []
            };
            reconstructedModules.push(existingMod);
          }
          existingMod.chapters.push(levelObj);
        });

        setModules(reconstructedModules);
        setLevels(flatLevels);

        let unlockedIndex = 0;
        response.roadmap.nodes.forEach((node: any, idx: number) => {
          if (node.status === 'CLEARED') unlockedIndex = idx + 1;
        });
        setHighestUnlockedIndex(unlockedIndex);
        
        setShowOverview(true);
      }
    };

    loadSavedRoadmap();
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setFormData({ ...formData, [e.target.name]: e.target.value }); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.targetCompany || !formData.targetRole) return alert("Fill out target enterprise and role.");
    
    setIsGenerating(true);
    try {
      const customFormData = { ...formData, missingSkills: "None" }; 
      const result = await generateRoadmapAction(customFormData as any, false, user.id, user.email);
      if (result.success && result.gameData) {
        setJobProfile(result.gameData.jobProfile);
        setModules(result.gameData.modules);
        if (result.gameData.learning_resources) {
          setLearningResources(result.gameData.learning_resources);
        }
        const flatLevels: Level[] = [];
        result.gameData.modules.forEach((mod: Module) => mod.chapters.forEach((chap: Level) => flatLevels.push(chap)));
        setLevels(flatLevels);
        setShowOverview(true); 
      }
    } catch (error) { console.error(error); } finally { setIsGenerating(false); }
  };

  const openNodeWorkspace = async (index: number) => {
    setSelectedLevelIndex(index);
    setCurrentQuestionIndex(0); 
    setCurrentVideoId(null);
    setGraderFeedback(null);
    setStudentAnswer("// Write your solution here...\n");
    if (levels) {
      const videoResponse = await getYouTubeVideoAction(levels[index].youtube_search_term);
      if (videoResponse.success) setCurrentVideoId(videoResponse.videoId);
    }
  };

  const handleSubmitAssignment = async () => {
    if (!studentAnswer || !levels || selectedLevelIndex === null) return;
    setIsGrading(true);
    try {
      let rawPrompts = levels[selectedLevelIndex].assignment_prompt;
      if (!rawPrompts || rawPrompts.trim() === "" || rawPrompts === "Write your solution here.") {
        rawPrompts = "1. (Warm-up) Write a brute-force algorithm for this concept.\n\n2. (Execution) Implement the optimal algorithm using a Hash Map.\n\n3. (Boss Fight) Optimize the time complexity to O(n) to pass strict FAANG constraints.";
      }
      
      const questionsList = rawPrompts.split(/\n\s*\n/).filter((q: string) => q.trim().length > 0);
      const currentQuestionPrompt = questionsList[currentQuestionIndex] || questionsList[0];
      const isBossFight = currentQuestionIndex === questionsList.length - 1;

      const response = await gradeAssignmentAction(studentAnswer, currentQuestionPrompt, formData.targetCompany);
      
      if (response.success && response.result) {
        setGraderFeedback(response.result);

        const effectivelyPassedNode = isBossFight && response.result.passed;

        const currentSequenceIndex = levels[selectedLevelIndex].id;
        await saveCodeSubmissionAction(
          currentSequenceIndex, 
          studentAnswer, 
          response.result.feedback, 
          response.result.score, 
          effectivelyPassedNode, 
          user.id
        );

        if (response.result.passed) {
          setTimeout(() => {
            setGraderFeedback(null); 
            if (isBossFight) {
              if (selectedLevelIndex === levels.length - 1) setIsInterviewUnlocked(true);
              else if (selectedLevelIndex === highestUnlockedIndex) setHighestUnlockedIndex(highestUnlockedIndex + 1);
              setSelectedLevelIndex(null);
            } else {
              setCurrentQuestionIndex(prev => prev + 1);
              setStudentAnswer("// Write your solution here...\n");
            }
          }, 2500);
        }
      }
    } catch (error) { console.error(error); } finally { setIsGrading(false); }
  };

  const handleInterviewComplete = async (transcript: any[], biometrics?: any) => {
    const wasGeneralHR = showGeneralHR; 
    setShowInterview(false);
    setShowGeneralHR(false);
    setIsEvaluating(true);
    try {
      const result = await evaluateInterviewAction(transcript, formData.targetRole, wasGeneralHR, user.id, biometrics);
      if (result.success) setInterviewReport(result.report);
    } catch (error) { 
      console.error(error); 
    } finally { 
      setIsEvaluating(false); 
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-[#0071e3]/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin z-10"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#f5f5f7] font-sans flex flex-col items-center py-10 px-6 selection:bg-white/20 relative overflow-x-hidden">
      
      <div className="fixed top-[-10%] right-[-5%] w-[50rem] h-[50rem] bg-gradient-to-br from-[#0071e3] to-[#bf5af2] rounded-full mix-blend-screen filter blur-[180px] opacity-20 animate-[pulse_10s_ease-in-out_infinite] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] left-[-10%] w-[40rem] h-[40rem] bg-gradient-to-tr from-[#ff9f0a] to-[#ff3b30] rounded-full mix-blend-screen filter blur-[200px] opacity-10 animate-[pulse_12s_ease-in-out_infinite_reverse] pointer-events-none"></div>

      <div className="fixed top-0 w-full bg-black/40 backdrop-blur-3xl border-b border-white/10 px-8 py-5 flex justify-between items-center z-40 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
        <div className="font-bold text-2xl tracking-tighter text-white flex items-center gap-3">
          <img src="/onyx-logo.jpg" alt="Onyx" className="w-9 h-9 rounded-lg object-cover shadow-[0_0_15px_rgba(191,90,242,0.3)] border border-white/5" />
          Onyx. <span className="text-[#86868b] font-normal text-lg tracking-normal">| Protocol</span>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-sm font-medium text-[#86868b] hidden md:block tracking-wide">{user.email}</div>
          
          {(levels && !showOverview && (selectedLevelIndex !== null || showInterview || showGeneralHR) && !isEvaluating && !interviewReport) && (
            <button onClick={() => { setSelectedLevelIndex(null); setShowInterview(false); setShowGeneralHR(false); }} className="text-xs font-bold text-white uppercase tracking-widest bg-white/5 hover:bg-white/10 px-6 py-2.5 rounded-full border border-white/10 transition-all duration-300 backdrop-blur-md">
              Dashboard
            </button>
          )}

          <button 
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/login');
            }} 
            className="text-xs font-bold text-[#ff3b30] hover:text-white uppercase tracking-widest bg-[#ff3b30]/10 hover:bg-[#ff3b30]/80 px-6 py-2.5 rounded-full border border-[#ff3b30]/20 transition-all duration-300 backdrop-blur-md"
          >
            Exit
          </button>
        </div>
      </div>

      <div className="max-w-5xl w-full mt-32 z-10">
        {!levels ? (
          <div className="bg-[#1d1d1f]/60 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-14 shadow-[0_20px_60px_rgba(0,0,0,0.6)] relative overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out">
            <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>
            <div className="absolute top-[-20%] right-[-10%] w-[30rem] h-[30rem] bg-[#0071e3]/10 rounded-full blur-[120px] pointer-events-none"></div>
            
            <div className="mb-14 text-center relative z-10">
              <h1 className="text-5xl md:text-6xl font-bold tracking-tighter mb-4 text-white uppercase">Initialize Pathway.</h1>
              <p className="text-[#a1a1a6] text-lg font-light">Bespoke technical gauntlet generation based on your credentials.</p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <input type="text" name="targetCompany" placeholder="Target Enterprise" onChange={handleInputChange} className="w-full bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white font-medium focus:outline-none focus:border-[#0071e3] focus:bg-[#1d1d1f] transition-all shadow-inner placeholder:text-[#515154]" required />
                <input type="text" name="targetRole" placeholder="Target Position" onChange={handleInputChange} className="w-full bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white font-medium focus:outline-none focus:border-[#0071e3] focus:bg-[#1d1d1f] transition-all shadow-inner placeholder:text-[#515154]" required />
                <input type="text" name="degree" placeholder="Degree (e.g. B.Tech CS)" onChange={handleInputChange} className="w-full bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white font-medium focus:outline-none focus:border-[#0071e3] focus:bg-[#1d1d1f] transition-all shadow-inner placeholder:text-[#515154]" required />
                <select name="currentYear" onChange={handleInputChange} value={formData.currentYear} className="w-full bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white font-medium focus:outline-none focus:border-[#0071e3] focus:bg-[#1d1d1f] transition-all appearance-none shadow-inner">
                  <option className="bg-[#0a0a0a]">1st Year</option><option className="bg-[#0a0a0a]">2nd Year</option><option className="bg-[#0a0a0a]">3rd Year</option><option className="bg-[#0a0a0a]">4th Year</option><option className="bg-[#0a0a0a]">Graduated</option>
                </select>
              </div>
              
              <button type="submit" disabled={isGenerating} className="group relative w-full overflow-hidden bg-[#f5f5f7] text-black font-bold text-lg py-5 rounded-full transition-all duration-500 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:shadow-[0_0_60px_rgba(255,255,255,0.3)] mt-6">
                <span className="relative z-10 tracking-tight">{isGenerating ? "Synthesizing Onyx Nodes..." : "Generate Master Curriculum"}</span>
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              </button>
            </form>
          </div>
        ) : showOverview && jobProfile ? (
          <div className="w-full animate-in zoom-in-95 duration-700 ease-out fill-mode-both">
            <div className="bg-[#1d1d1f]/60 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-16 shadow-[0_20px_60px_rgba(0,0,0,0.6)] relative overflow-hidden">
              <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>
              <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-[#34c759]/10 blur-[150px] rounded-full pointer-events-none"></div>
              
              <div className="relative z-10 text-center max-w-4xl mx-auto">
                <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 tracking-tighter leading-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-[#86868b]">{jobProfile.title}</h1>
                <div className="inline-block bg-[#34c759]/10 border border-[#34c759]/20 text-[#34c759] font-mono px-6 py-3 rounded-full mb-10 text-sm tracking-widest uppercase font-bold shadow-sm">Target Salary: {jobProfile.expectedSalary}</div>
                <p className="text-xl text-[#a1a1a6] leading-relaxed mb-16 font-light">{jobProfile.description}</p>
                <button onClick={() => setShowOverview(false)} className="bg-[#f5f5f7] text-black font-bold py-5 px-14 rounded-full hover:shadow-[0_0_50px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition-all duration-500 tracking-tight text-lg uppercase">Enter Operations →</button>
              </div>
            </div>
          </div>
        ) : isEvaluating ? (
          <div className="w-full flex flex-col items-center justify-center min-h-[600px] animate-in fade-in duration-500">
            <div className="w-24 h-24 border-4 border-white/10 border-t-white rounded-full animate-spin mb-8 shadow-[0_0_40px_rgba(255,255,255,0.2)]"></div>
            <h2 className="text-4xl font-bold text-white tracking-tighter animate-pulse uppercase">Analyzing Transcript...</h2>
          </div>
        ) : interviewReport ? (
          <PostInterviewReport 
            targetRole={formData.targetRole} 
            score={interviewReport.score} 
            feedback={{
              summary: interviewReport.summary, 
              strengths: interviewReport.strengths || [], 
              weaknesses: interviewReport.weaknesses || [],
              cognitive_analysis: interviewReport.cognitive_analysis
            }} 
            transcript={[]} 
            onFinish={() => { setInterviewReport(null); setLevels(null); setModules(null); setJobProfile(null); setHighestUnlockedIndex(0); setIsInterviewUnlocked(false); }} 
          />
        ) : showInterview || showGeneralHR ? (
          <div className="w-full animate-in zoom-in-95 duration-700 ease-out">
            <div className="text-center mb-12">
              <h2 className="text-6xl font-bold text-white tracking-tighter mb-4 uppercase">{showGeneralHR ? "Communication Lab" : "The Final Trial"}</h2>
              <p className="text-[#a1a1a6] font-light text-xl">Calibrating technical articulation and soft-skill execution.</p>
            </div>
            <VoiceInterview targetRole={formData.targetRole} onInterviewComplete={handleInterviewComplete} isGeneralHR={showGeneralHR} />
          </div>
        ) : (
          <div className="w-full relative pb-32">
            
            <div className={`w-full max-w-5xl mx-auto mb-16 grid grid-cols-1 lg:grid-cols-3 gap-8 transition-all duration-700 ${selectedLevelIndex !== null ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100 animate-in fade-in slide-in-from-bottom-8 duration-1000'}`}>
              
              <div className="bg-[#1d1d1f]/60 backdrop-blur-3xl border border-white/10 p-10 rounded-[3rem] hover:-translate-y-2 hover:border-white/30 transition-all duration-500 shadow-[0_20px_50px_rgba(0,0,0,0.4)] group relative overflow-hidden">
                <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>
                <div className="w-16 h-16 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-3xl mb-8 shadow-sm group-hover:scale-110 transition-transform duration-500">🛠️</div>
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight uppercase">Technical Saga</h3>
                <p className="text-[#a1a1a6] text-base font-light leading-relaxed">Master the {formData.targetCompany} stack node by node.</p>
              </div>

              <div onClick={() => setShowGeneralHR(true)} className="bg-[#1d1d1f]/60 backdrop-blur-3xl border border-white/10 p-10 rounded-[3rem] hover:-translate-y-2 hover:border-[#bf5af2]/50 hover:shadow-[0_20px_60px_rgba(191,90,242,0.2)] transition-all duration-500 cursor-pointer group relative overflow-hidden">
                <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>
                <div className="absolute top-[-20%] right-[-10%] w-[30rem] h-[30rem] bg-[#bf5af2]/20 blur-[100px] rounded-full group-hover:bg-[#bf5af2]/40 transition-colors duration-700 pointer-events-none"></div>
                
                <div className="w-16 h-16 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-3xl mb-8 shadow-sm group-hover:scale-110 transition-transform duration-500 relative z-10">🎤</div>
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight uppercase">Comm Lab</h3>
                <p className="text-[#a1a1a6] text-base font-light leading-relaxed relative z-10">Practice behavioral rounds and soft skills on-demand.</p>
                <span className="text-xs text-[#bf5af2] font-bold mt-8 block opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest relative z-10">Open Arena →</span>
              </div>

              <div onClick={() => setShowInterview(true)} className="bg-[#1d1d1f]/60 backdrop-blur-3xl border border-white/10 p-10 rounded-[3rem] hover:-translate-y-2 hover:border-[#ff3b30]/50 hover:shadow-[0_20px_60px_rgba(255,59,48,0.2)] transition-all duration-500 cursor-pointer group relative overflow-hidden">
                <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>
                <div className="absolute top-[-20%] right-[-10%] w-[30rem] h-[30rem] bg-[#ff3b30]/20 blur-[100px] rounded-full group-hover:bg-[#ff3b30]/40 transition-colors duration-700 pointer-events-none"></div>
                
                <div className="w-16 h-16 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-3xl mb-8 shadow-sm group-hover:scale-110 transition-transform duration-500 relative z-10">⚔️</div>
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tight uppercase">Final Trial</h3>
                <p className="text-[#a1a1a6] text-base font-light leading-relaxed relative z-10">Brutal, high-pressure technical HR simulation.</p>
                <span className="text-xs text-[#ff3b30] font-bold mt-8 block opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest relative z-10">Enter Crucible →</span>
              </div>
            </div>

            {learningResources && (
              <div className={`w-full max-w-5xl mx-auto mb-20 transition-all duration-700 ${selectedLevelIndex !== null ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150'}`}>
                <div className="text-center mb-10">
                  <h2 className="text-4xl font-bold text-white mb-3 tracking-tighter uppercase">Intel Acquisition</h2>
                  <p className="text-[#a1a1a6] text-lg font-light">Targeted credentials for {formData.targetCompany}.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-[#1d1d1f]/40 backdrop-blur-3xl border border-[#34c759]/20 rounded-[3rem] p-10 shadow-[0_20px_50px_rgba(52,199,89,0.05)] relative overflow-hidden group hover:border-[#34c759]/40 transition-colors duration-500">
                    <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>
                    <div className="absolute top-[-20%] right-[-10%] w-[20rem] h-[20rem] bg-[#34c759]/10 blur-[80px] rounded-full pointer-events-none"></div>
                    <div className="relative z-10">
                      <span className="text-[#34c759] font-bold tracking-widest text-xs uppercase mb-4 block">Zero-Cost Track</span>
                      <h3 className="text-3xl font-bold text-white tracking-tight mb-8">Open Source Intel</h3>
                      <div className="space-y-6">
                        {learningResources.free_track.map((item: any, idx: number) => (
                          <div key={idx} className="flex flex-col border-b border-white/5 pb-4 last:border-0">
                            <span className="text-xs text-[#a1a1a6] font-mono mb-1">{item.type}</span>
                            <strong className="text-white text-lg">{item.title}</strong>
                            {(item.search_term || item.link) && <span className="text-[#34c759] text-sm mt-1">{item.search_term || item.link}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#1d1d1f]/40 backdrop-blur-3xl border border-[#bf5af2]/20 rounded-[3rem] p-10 shadow-[0_20px_50px_rgba(191,90,242,0.05)] relative overflow-hidden group hover:border-[#bf5af2]/40 transition-colors duration-500">
                    <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>
                    <div className="absolute top-[-20%] right-[-10%] w-[20rem] h-[20rem] bg-[#bf5af2]/10 blur-[80px] rounded-full pointer-events-none"></div>
                    <div className="relative z-10">
                      <span className="text-[#bf5af2] font-bold tracking-widest text-xs uppercase mb-4 block">Premium Track</span>
                      <h3 className="text-3xl font-bold text-white tracking-tight mb-8">Enterprise Credentials</h3>
                      <div className="space-y-6">
                        {learningResources.premium_track.map((item: any, idx: number) => (
                          <div key={idx} className="flex flex-col border-b border-white/5 pb-4 last:border-0">
                            <span className="text-xs text-[#a1a1a6] font-mono mb-1">{item.type}</span>
                            <div className="flex justify-between items-start gap-4">
                              <strong className="text-white text-lg flex-1">{item.title}</strong>
                              <span className="text-[#bf5af2] text-sm font-bold bg-[#bf5af2]/10 px-3 py-1 rounded-full whitespace-nowrap">{item.cost}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={`w-full flex flex-col items-center transition-all duration-700 ${selectedLevelIndex !== null ? 'opacity-30 blur-md scale-[0.98]' : 'opacity-100 blur-0 scale-100'}`}>
              <div className="text-center mb-10 animate-in fade-in duration-1000 delay-300">
                <h2 className="text-6xl font-bold text-white mb-4 tracking-tighter uppercase">Core Gauntlet.</h2>
                <p className="text-xl text-[#a1a1a6] font-light mb-8">Execution is mandatory. Secure the stones.</p>
              </div>
              
              <div className="w-full max-w-5xl mb-20">
                <GauntletCanvas unlockedIndex={highestUnlockedIndex} />
              </div>
              
              <div className="w-full max-w-4xl flex flex-col gap-20">
                {modules?.map((mod, modIdx) => (
                  <div key={mod.module_id} className="relative w-full bg-[#1d1d1f]/40 border border-white/10 rounded-[3rem] p-14 backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] group hover:border-white/20 transition-colors duration-500 animate-in fade-in slide-in-from-bottom-12 duration-1000 fill-mode-both" style={{ animationDelay: `${(modIdx + 3) * 150}ms` }}>
                    <div className="absolute inset-0 border-[1px] border-white/5 rounded-[3rem] pointer-events-none"></div>
                    
                    <div className="border-b border-white/10 pb-10 mb-12 relative z-10">
                      <span className="text-[#0071e3] font-bold tracking-widest text-sm uppercase mb-4 block">Phase 0{modIdx + 1}</span>
                      <h3 className="text-5xl font-bold text-white tracking-tighter">{mod.module_title}</h3>
                    </div>
                    
                    <div className="flex flex-col gap-10 pl-10 border-l-[3px] border-white/10 ml-8 relative z-10">
                      {mod.chapters.map((chapter) => {
                        const flatIndex = chapter.id - 1; 
                        const isUnlocked = flatIndex <= highestUnlockedIndex;
                        const isCompleted = flatIndex < highestUnlockedIndex;
                        return (
                          <div key={chapter.id} className="relative flex items-center gap-10 group/node">
                            <button onClick={() => isUnlocked && openNodeWorkspace(flatIndex)} disabled={!isUnlocked} className={`relative -ml-[81px] z-10 w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl transition-all duration-500 transform border-[6px] border-[#0a0a0a] ${isCompleted ? 'bg-[#34c759] text-white shadow-[0_0_40px_rgba(52,199,89,0.5)]' : isUnlocked ? 'bg-[#f5f5f7] text-black scale-110 hover:scale-125 shadow-[0_0_30px_rgba(255,255,255,0.3)]' : 'bg-[#1d1d1f] text-[#86868b]'}`}>{isUnlocked ? chapter.id : '🔒'}</button>
                            <div className={`flex-1 p-8 rounded-[2rem] border backdrop-blur-xl transition-all duration-300 ${isUnlocked ? 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10 cursor-pointer shadow-lg hover:-translate-y-1' : 'bg-transparent border-transparent opacity-40'}`} onClick={() => isUnlocked && openNodeWorkspace(flatIndex)}>
                              <h4 className={`font-bold text-2xl tracking-tight ${isUnlocked ? 'text-white' : 'text-[#86868b]'}`}>{chapter.title}</h4>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedLevelIndex !== null && (
              <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-md animate-in fade-in duration-500">
                <div className="w-full max-w-[95vw] xl:max-w-[85vw] h-full bg-[#0a0a0a]/95 backdrop-blur-3xl border-l border-white/10 shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col animate-in slide-in-from-right-full duration-700 ease-out relative">
                  
                  <div className="flex justify-between items-center px-12 py-8 border-b border-white/10 bg-transparent relative z-10 shrink-0">
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 rounded-full bg-[#f5f5f7] text-black flex items-center justify-center font-bold text-2xl shadow-[0_0_30px_rgba(255,255,255,0.2)]">{levels[selectedLevelIndex].id}</div>
                      <h2 className="text-4xl font-bold text-white tracking-tighter">{levels[selectedLevelIndex].title}</h2>
                    </div>
                    <button onClick={() => setSelectedLevelIndex(null)} className="w-14 h-14 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white border border-white/10 transition-colors hover:rotate-90 duration-300 text-xl">✕</button>
                  </div>
                  
                  <div className="flex-1 flex overflow-hidden">
                    
                    <div className="w-5/12 flex flex-col border-r border-white/10 bg-transparent overflow-y-auto">
                      <div className="p-10 border-b border-white/10 bg-black/40 shrink-0">
                        <div className="w-full aspect-video bg-black/80 rounded-3xl border border-white/10 overflow-hidden flex items-center justify-center relative shadow-inner">
                          {!currentVideoId ? (
                            <div className="flex flex-col items-center text-[#86868b] animate-pulse">
                              <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4"></div>
                              <span className="text-sm uppercase tracking-widest font-bold font-mono tracking-tighter">Decrypting Intel...</span>
                            </div>
                          ) : (
                            <iframe className="w-full h-full absolute inset-0" src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=0`} title="Tutorial" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                          )}
                        </div>
                      </div>
                      <div className="p-12"><div className="text-[#a1a1a6] text-lg leading-relaxed font-light">{levels[selectedLevelIndex].notes}</div></div>
                    </div>
                    
                    {(() => {
                      let rawPrompts = levels[selectedLevelIndex].assignment_prompt;
                      
                      if (!rawPrompts || rawPrompts.trim() === "" || rawPrompts === "Write your solution here.") {
                        rawPrompts = "1. (Warm-up) Write a brute-force algorithm for this concept.\n\n2. (Execution) Implement the optimal algorithm using a Hash Map.\n\n3. (Boss Fight) Optimize the time complexity to O(n) to pass strict FAANG constraints.";
                      }
                      
                      const questionsList = rawPrompts.split(/\n\s*\n/).filter((q: string) => q.trim().length > 0);
                      const currentQuestion = questionsList[currentQuestionIndex] || questionsList[0];
                      const totalQuestions = questionsList.length;

                      return (
                        <div className="w-7/12 flex flex-col bg-[#050505] h-full overflow-hidden relative">
                          
                          <div className="bg-black/80 backdrop-blur-xl border-b border-white/10 shrink-0 flex flex-col z-10 shadow-md">
                            <div className="flex justify-between items-center px-10 py-5 border-b border-white/5">
                              <span className="text-[#86868b] text-sm font-bold uppercase tracking-widest font-mono">
                                Node Progress: {currentQuestionIndex + 1} / {totalQuestions}
                              </span>
                              <div className="flex gap-3">
                                <button onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))} disabled={currentQuestionIndex === 0} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-semibold disabled:opacity-30 transition-all border border-white/5">
                                  ← Back
                                </button>
                                <button onClick={() => { setCurrentQuestionIndex(Math.min(totalQuestions - 1, currentQuestionIndex + 1)); setGraderFeedback(null); setStudentAnswer("// Write your solution here...\n"); }} disabled={currentQuestionIndex === totalQuestions - 1} className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-semibold disabled:opacity-30 transition-all border border-white/5">
                                  Skip Node →
                                </button>
                              </div>
                            </div>
                            
                            <div className="p-10 max-h-64 overflow-y-auto">
                              <p className="text-white text-xl font-light leading-relaxed whitespace-pre-wrap">
                                {currentQuestion}
                              </p>
                            </div>
                          </div>
                          
                          {/* FIX: Added min-h-0 so the editor correctly shrinks to available vertical space */}
                          <div className="flex-1 relative min-h-0">
                            <Editor height="100%" defaultLanguage="javascript" theme="vs-dark" value={studentAnswer} onChange={(val) => setStudentAnswer(val || "")} options={{ minimap: { enabled: false }, padding: { top: 32 }, fontSize: 16, fontFamily: 'monospace' }} />
                          </div>
                          
                          {/* FIX: Separated the scrollable feedback from the sticky button so the button is always visible */}
                          <div className="bg-black/60 backdrop-blur-2xl border-t border-white/10 shrink-0 z-10 flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                            
                            {graderFeedback && (
                              <div className="max-h-[30vh] overflow-y-auto p-8 border-b border-white/5">
                                <div className={`p-6 rounded-2xl border backdrop-blur-md shrink-0 ${graderFeedback.passed ? 'bg-[#34c759]/10 border-[#34c759]/30 shadow-[0_0_40px_rgba(52,199,89,0.15)]' : 'bg-[#ff3b30]/10 border-[#ff3b30]/30 shadow-[0_0_40px_rgba(255,59,48,0.15)]'}`}>
                                  <p className="text-white text-base font-light leading-relaxed">{graderFeedback.feedback}</p>
                                </div>
                              </div>
                            )}

                            <div className="p-8 shrink-0">
                              <button onClick={handleSubmitAssignment} disabled={isGrading} className="w-full relative overflow-hidden bg-[#f5f5f7] text-black font-bold text-lg py-5 rounded-full transition-all duration-500 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-[0_0_30px_rgba(255,255,255,0.15)] hover:shadow-[0_0_50px_rgba(255,255,255,0.4)] block">
                                <span className="relative z-10 tracking-tight uppercase">
                                  {isGrading ? "Analyzing Syntax..." : (currentQuestionIndex === totalQuestions - 1 ? "Execute & Secure Node" : "Execute & Progress")}
                                </span>
                                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                              </button>
                            </div>

                          </div>
                        </div>
                      );
                    })()}

                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* SECRET DEMO BUTTON - REMOVE BEFORE PRODUCTION */}
        <button 
          onClick={() => setHighestUnlockedIndex(prev => (prev < 6 ? prev + 1 : 0))}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-[#bf5af2] to-[#0071e3] text-white px-5 py-3 rounded-full font-bold text-sm shadow-[0_0_20px_rgba(191,90,242,0.4)] hover:scale-105 hover:shadow-[0_0_30px_rgba(191,90,242,0.6)] transition-all uppercase tracking-wider border border-white/20 backdrop-blur-md"
        >
          Inject Stone 💎
        </button>
      </div>
    </div>
  );
}