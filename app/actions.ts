'use server';

import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import prisma from '../lib/db'; 
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import bcrypt from 'bcryptjs';

const ai = new GoogleGenAI({});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY }); 

// --- ACTION 1: GENERATE INITIAL ROADMAP (THE BASELINE) ---
// 🔥 OVERHAULED: Now delegates reasoning to SAM in the Python backend
export async function generateRoadmapAction(formData: any, hasResume: boolean, userId: string, userEmail: string) {
  try {
    const diagnosticScore = typeof formData.diagnosticScore === 'number' ? formData.diagnosticScore : 50;

    console.log("Server Action: Waking up Sam (Python) to generate curriculum...");

    // 1. Call Python (Sam) to do the heavy AI lifting
    const response = await fetch("http://127.0.0.1:8000/api/sam/onboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        user_email: userEmail,
        name: formData.name || 'Candidate',
        target_role: formData.targetRole,
        target_company: formData.targetCompany,
        current_year: formData.currentYear || "Unknown",
        diagnostic_score: diagnosticScore
      }),
    });

    if (!response.ok) throw new Error("Failed to wake up Sam in the Python backend.");
    const aiData = await response.json();
    const gameData = aiData.gameData;

    // 2. Clean slate the DB
    await prisma.roadmap.deleteMany({ where: { userId: userId } });

    let globalChapterId = 1;
    const dbNodes: any[] = [];

    // 3. Parse the AI JSON from Python
    gameData.modules?.forEach((mod: any) => {
      mod.chapters?.forEach((chapter: any) => {
        let combinedPrompts = Array.isArray(chapter.assignment_prompts) 
          ? chapter.assignment_prompts.join('\n\n') 
          : (chapter.assignment_prompts || `1. Optimize ${chapter.title}`);

        dbNodes.push({
          sequenceIndex: globalChapterId,
          phaseTitle: mod.module_title || `Phase ${mod.phase_id || 1}`,
          chapterTitle: chapter.title || "Untitled Node",
          notes: chapter.notes || "Review docs.",
          studyMaterial: chapter.study_material || "Initializing...",
          assignmentPrompt: combinedPrompts,
          youtubeSearchTerm: chapter.youtube_search_term || `${formData.targetRole} prep`,
          status: globalChapterId === 1 ? 'UNLOCKED' : 'LOCKED'
        });
        globalChapterId++;
      });
    });

    // 4. Save to DB using Prisma JS
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: { targetCompany: formData.targetCompany, targetRole: formData.targetRole },
      create: {
        id: userId, email: userEmail, name: formData.name || 'Future FAANG Engineer',
        targetCompany: formData.targetCompany, targetRole: formData.targetRole,
      },
    });

    await prisma.roadmap.create({
      data: {
        userId: user.id,
        title: gameData.jobProfile?.title || `${formData.targetRole} at ${formData.targetCompany}`,
        expectedSalary: gameData.jobProfile?.expectedSalary || "Market Standard",
        description: gameData.jobProfile?.description || "",
        requiredSkills: gameData.jobProfile?.requiredSkills || [],
        nodes: { create: dbNodes }
      }
    });

    console.log("Server Action: Sam's Roadmap successfully saved to Database!");
    return { success: true, gameData };
  } catch (error: any) {
    console.error("Roadmap Generation Error:", error);
    return { success: false, error: error.message };
  }
}

// --- ACTION 2: THE AUTO-GRADER (ARENA / FALLBACK EDITION) ---
export async function gradeAssignmentAction(code: string, questionPrompt: string, targetCompany: string) {
  try {
    let maxLoopDepth = 0;
    let astSuccess = false;
    let calculatedTimeComplexity = "N/A";

    try {
      const ast = acorn.parse(code, { ecmaVersion: 2024, sourceType: "module" });
      astSuccess = true;
      walk.ancestor(ast, {
        ForStatement(node: any, state: any, ancestors: any[]) { maxLoopDepth = Math.max(maxLoopDepth, ancestors.filter((n: any) => n.type.includes('Statement')).length); },
        WhileStatement(node: any, state: any, ancestors: any[]) { maxLoopDepth = Math.max(maxLoopDepth, ancestors.filter((n: any) => n.type.includes('Statement')).length); },
      });
      calculatedTimeComplexity = maxLoopDepth === 0 ? "O(1)" : maxLoopDepth === 1 ? "O(n)" : `O(n^${maxLoopDepth})`;
    } catch (err: any) {
      console.log("AST Parser skipped: Input is plain text or non-JS.");
    }

    const astContext = astSuccess 
      ? `AST DATA:\n- LOOP DEPTH: ${maxLoopDepth}\n- COMPLEXITY: ${calculatedTimeComplexity}`
      : `CONTEXT: Evaluate as conceptual or system design answer.`;

    const systemPrompt = `You are the lead evaluator for ${targetCompany}.
    Grading prompt: "${questionPrompt}"
    ${astContext}
    
    Output strictly in JSON:
    {
      "passed": <boolean>,
      "score": <number 0-100>,
      "feedback": "<string>",
      "metrics": { "timeComplexity": "<string>", "spaceComplexity": "<string>" }
    }`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Evaluate this:\n\n${code}` }
      ],
      model: "llama3-70b-8192",
      response_format: { type: "json_object" }, 
    });

    return { success: true, result: JSON.parse(chatCompletion.choices[0]?.message?.content || "{}") };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 3: THE GROQ TEXT-ONLY ATS SCANNER ---
export async function analyzeResumeAction(extractedText: string, targetRole: string) {
  try {
    const systemPrompt = `You are an ATS technical recruiter.
    Analyze this text against the role: ${targetRole}.
    
    Output STRICT JSON:
    {
      "is_resume": boolean,
      "rejection_reason": "string",
      "overall_ats_score": <number 0-100>,
      "roast": "string",
      "improvement_plan": ["string", "string"],
      "missing_ats_keywords": ["string", "string"]
    }`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: extractedText }
      ],
      model: "llama3-70b-8192", 
      response_format: { type: "json_object" }, 
    });

    return { success: true, result: JSON.parse(chatCompletion.choices[0]?.message?.content || "{}") };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 4: THE SOCRATIC RESUME BUILDER ---
export async function buildResumeChatAction(chatHistory: { role: string; text: string }[], targetRole: string, targetCompany: string) {
  try {
    const historyText = chatHistory.map(msg => `${msg.role}: ${msg.text}`).join("\n\n");
    const systemPrompt = `You are a supportive Onyx placement mentor. Help build a resume for ${targetRole} at ${targetCompany}.
    
    Output STRICT JSON:
    {
      "is_complete": <boolean>,
      "next_question": "<string>",
      "final_resume_html": "<string>",
      "missing_ats_keywords": ["<keyword>"],
      "overall_ats_score": <number 90-100>
    }`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Chat Log:\n${historyText}` }
      ],
      model: "llama3-70b-8192",
      response_format: { type: "json_object" },
    });

    return { success: true, result: JSON.parse(chatCompletion.choices[0]?.message?.content || "{}") };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 5: YOUTUBE MOST-VIEWED VIDEO FETCHER ---
export async function getYouTubeVideoAction(query: string) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return { success: true, videoId: "pkYVOmU3MgA" }; 
    
    const modifiedQuery = query + " -shorts";
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(modifiedQuery)}&type=video&videoDuration=long&order=viewCount&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) return { success: true, videoId: data.items[0].id.videoId };
    throw new Error("No videos found.");
  } catch (error: any) {
    return { success: false, videoId: "pkYVOmU3MgA" }; 
  }
}

// --- ACTION 6: FETCH ACTIVE ROADMAP FROM DATABASE ---
export async function getUserRoadmapAction(userId: string) {
  try {
    const roadmap = await prisma.roadmap.findFirst({
      where: { userId: userId }, 
      include: { nodes: { orderBy: { sequenceIndex: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });
    return roadmap ? { success: true, roadmap } : { success: false, message: "No active roadmap found." };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 7: SAVE CODE SUBMISSION & UNLOCK NEXT NODE ---
export async function saveCodeSubmissionAction(
  sequenceIndex: number, 
  codeWritten: string, 
  aiFeedback: string, 
  score: number, 
  passed: boolean, 
  userId: string,
  telemetry?: { attempts: number; timeSpentSeconds: number } // 🔥 Restored the 7th argument!
) {
  try {
    const roadmap = await prisma.roadmap.findFirst({ where: { userId: userId }, orderBy: { createdAt: 'desc' }, include: { nodes: true } });
    if (!roadmap) throw new Error("No roadmap found");

    const targetNode = roadmap.nodes.find(n => n.sequenceIndex === sequenceIndex);
    if (!targetNode) throw new Error("Target node not found");

    await prisma.codeSubmission.create({
      data: { 
        userId, 
        nodeId: targetNode.id, 
        codeWritten, 
        aiFeedback, 
        score, 
        passed,
        attempts: telemetry?.attempts || 1,
        timeSpentSecs: telemetry?.timeSpentSeconds || null
      }
    });

    if (passed) {
      await prisma.roadmapNode.update({ where: { id: targetNode.id }, data: { status: 'CLEARED' } });
      await prisma.roadmapNode.updateMany({
        where: { roadmapId: roadmap.id, sequenceIndex: sequenceIndex + 1, status: 'LOCKED' },
        data: { status: 'UNLOCKED' }
      });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

// --- ACTION 8: GROQ WHISPER SPEECH-TO-TEXT ---
export async function transcribeAudioAction(formData: FormData) {
  try {
    const audioFile = formData.get("audio") as File;
    if (!audioFile) throw new Error("No audio file received.");

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      prompt: "Umm, let me think. Uh, the architecture is, ah, quite complex.", 
      response_format: "json",
    });
    return { success: true, text: transcription.text };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 9: ENDLESS LEETCODE GENERATOR ---
export async function generateArenaQuestionAction(difficulty: string) {
  try {
    const systemPrompt = `You are the Onyx Arena Master. Generate a ${difficulty} algorithmic question.
    Output STRICT JSON: { "title": "string", "prompt": "markdown string with test cases" }`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }],
      model: "llama3-70b-8192",
      response_format: { type: "json_object" }, 
    });

    return { success: true, question: JSON.parse(chatCompletion.choices[0]?.message?.content || "{}") };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 10: SECURE USER SIGNUP ---
export async function signUpAction(formData: FormData) {
  try {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const name = formData.get('fullName') as string;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return { success: false, error: "A profile with this Auth Sync ID already exists." };

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, password: hashedPassword, name, targetCompany: "FAANG", targetRole: "Software Engineer" }
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: "Critical database insertion failure." };
  }
}

// --- ACTION 11: THE ONYX BRAIN BRIDGE (THE PANEL SWARM) ---
export async function submitToOnyxBrainAction(payload: {
  userId?: string;
  target_role: string;
  target_company: string;
  is_hr: boolean;
  live_code: string;
  whisper_transcript: string;
  chat_history: { role: string; text: string }[];
  cv_telemetry: Record<string, any>;
  panel_satisfaction: Record<string, boolean>; // 🔥 NOW FORWARDING SATISFACTION ARRAY
}) {
  try {
    let candidate_memory = undefined;
    if (payload.userId) {
      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (user) {
        candidate_memory = {
          user_name: user.name || "Candidate",
          target_company: user.targetCompany || payload.target_company,
          target_role: user.targetRole || payload.target_role,
          elo_rating: user.diagnosticScore || 1200,
          weak_spots: (user.profileTelemetry as any)?.weaknesses || ["Unknown"]
        };
      }
    }

    const finalPayload = { ...payload, candidate_memory };
    console.log("Transmitting payload to Onyx Brain Swarm (FastAPI)...");
    
    const response = await fetch("http://127.0.0.1:8000/api/swarm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalPayload),
    });

    if (!response.ok) throw new Error(`FastAPI Backend Error: ${response.statusText}`);

    const data = await response.json();
    return { success: true, swarmData: data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 12: CHAT WITH DIVA (THE INSTRUCTOR) ---
export async function chatWithDivaAction(text: string, moduleContext: string) {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        module_context: moduleContext
      }),
    });

    if (!response.ok) throw new Error("Diva Backend Error");
    
    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 13: CHECK ACTIVE ROADMAP STATUS ---
export async function checkUserRoadmapAction(userId: string) {
  try {
    const roadmap = await prisma.roadmap.findFirst({ where: { userId: userId } });
    return { success: true, hasRoadmap: !!roadmap };
  } catch (error: any) {
    return { success: false, hasRoadmap: false };
  }
}

// --- ACTION 14: PURGE TELEMETRY (THE NUKE) ---
export async function resetTelemetryAction(userId: string) {
  try {
    await prisma.roadmap.deleteMany({ where: { userId: userId } });
    await prisma.user.update({ where: { id: userId }, data: { diagnosticScore: null } });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 15: INGEST CANDIDATE PROFILE (FEEDS SAM'S DOSSIER) ---
export async function ingestCandidateProfileAction(userId: string, githubUrl: string, linkedinUrl: string, rawResume: string) {
  try {
    console.log("Server Action: Hitting Python Parser Service...");
    const response = await fetch("http://127.0.0.1:8000/api/profile/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        github_url: githubUrl,
        linkedin_url: linkedinUrl,
        raw_resume: rawResume
      }),
    });

    if (!response.ok) throw new Error("Parser Backend Error");
    const data = await response.json();

    if (data.status === "success") {
      // Save the resulting parsed JSON dossier into the profileTelemetry DB column
      await prisma.user.update({
        where: { id: userId },
        data: { profileTelemetry: data.dossier }
      });
    }
    
    return { success: true, dossier: data.dossier };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 16: GENERAL HR INTERVIEW ---
export async function conductGeneralHRAction(chatHistory: { role: string; text: string }[], targetRole: string) {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const formattedMessages = chatHistory.map(msg => ({
      role: msg.role === "ai" ? "assistant" : "user",
      content: msg.text
    }));
    
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: `You are Torii, the HR AI. The candidate is applying for ${targetRole}. Keep responses to 2 sentences max. Evaluate cultural fit.` },
        ...formattedMessages as any
      ],
      model: "llama3-8b-8192",
      temperature: 0.6
    });

    return { success: true, reply: completion.choices[0]?.message?.content };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}