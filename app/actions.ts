'use server';

import Groq from 'groq-sdk';
import prisma from '../lib/db'; 
import bcrypt from 'bcryptjs';
import { auth } from '@/auth';
import { BRAIN_URL, brainHeaders } from '@/lib/brain';
import { genai, GEMINI_MODELS } from '@/lib/gemini';

// Groq is reserved exclusively for fast speech-to-text (Whisper).
// All LLM reasoning & generation is powered by Google Gemini (Flash & Argon).
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' }); 

// --- ACTION 1: GENERATE INITIAL ROADMAP (THE BASELINE) ---
// 🔥 OVERHAULED: Now delegates reasoning to SAM in the Python backend
export async function generateRoadmapAction(formData: any, hasResume: boolean, clientUserId: string, clientUserEmail: string) {
  try {
    // Identity comes from the session, never from the client payload.
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Unauthorized" };
    const userEmail = session.user?.email || clientUserEmail;

    const diagnosticScore = typeof formData.diagnosticScore === 'number' ? formData.diagnosticScore : 50;

    console.log("Server Action: Waking up Sam (Python) to generate curriculum...");

    // 1. Call Python (Sam) to do the heavy AI lifting
    const response = await fetch(`${BRAIN_URL}/api/sam/onboard`, {
      method: "POST",
      headers: brainHeaders(),
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
    let astContext = "CONTEXT: Evaluate as conceptual or system design answer.";
    try {
      const astResponse = await fetch(`${BRAIN_URL}/api/ast/analyze`, {
        method: "POST",
        headers: brainHeaders(),
        body: JSON.stringify({ code: code, language: "python" })
      });
      if (astResponse.ok) {
        const astData = await astResponse.json();
        astContext = `AST DATA:\n- COMPLEXITY: ${astData.complexity}\n- FEEDBACK: ${astData.feedback}`;
      }
    } catch (err: any) {
      console.log("Failed to reach Python AST Engine. Proceeding without structural guarantees.");
    }

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

    const completion = await genai.models.generateContent({
      model: GEMINI_MODELS.FAST,
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nEvaluate this candidate code:\n\n${code}` }] }
      ],
      config: { responseMimeType: 'application/json' },
    });

    return { success: true, result: JSON.parse(completion.text?.trim() || "{}") };
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

    const completion = await genai.models.generateContent({
      model: GEMINI_MODELS.FAST,
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nCandidate resume text:\n${extractedText}` }] }
      ],
      config: { responseMimeType: 'application/json' },
    });

    return { success: true, result: JSON.parse(completion.text?.trim() || "{}") };
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

    const completion = await genai.models.generateContent({
      model: GEMINI_MODELS.FAST,
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nChat Log:\n${historyText}` }] }
      ],
      config: { responseMimeType: 'application/json' },
    });

    return { success: true, result: JSON.parse(completion.text?.trim() || "{}") };
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
export async function getUserRoadmapAction() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, message: "Unauthorized" };

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
  telemetry?: { attempts: number; timeSpentSeconds: number } // 🔥 Restored the 7th argument!
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, message: "Unauthorized" };
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

    const completion = await genai.models.generateContent({
      model: GEMINI_MODELS.FAST,
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      config: { responseMimeType: 'application/json' },
    });

    return { success: true, question: JSON.parse(completion.text?.trim() || "{}") };
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
  target_role: string;
  target_company: string;
  is_hr: boolean;
  live_code: string;
  language?: string;
  whisper_transcript: string;
  chat_history: { role: string; text: string }[];
  cv_telemetry: Record<string, any>;
  panel_satisfaction: Record<string, boolean>; // goal state is echoed back by the brain every turn
}) {
  try {
    // Identity comes from the session, never from the client payload.
    let candidate_memory = undefined;
    const session = await auth();
    const userId = session?.user?.id;
    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
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

    const finalPayload = { ...payload, language: payload.language || "python", candidate_memory };
    const brainUrl = BRAIN_URL;

    const response = await fetch(`${brainUrl}/api/swarm`, {
      method: "POST",
      headers: brainHeaders(),
      body: JSON.stringify(finalPayload),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`FastAPI Backend Error (${response.status}): ${detail.slice(0, 300)}`);
    }

    const data = await response.json();
    return { success: true, swarmData: data };
  } catch (error: any) {
    return { success: false, error: error?.name === "TimeoutError" ? "Panel timed out. Try again." : error.message };
  }
}

// --- ACTION 12a: START DIVA LECTURE ---
export async function startLectureAction(chapterTitle: string, studyMaterial: string) {
  try {
    const response = await fetch(`${BRAIN_URL}/api/lecture/start`, {
      method: "POST",
      headers: brainHeaders(),
      body: JSON.stringify({
        chapter_title: chapterTitle,
        study_material: studyMaterial,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }
  } catch (error: any) {
    console.warn("[startLectureAction] FastAPI offline/timed out, failing over to Gemini:", error?.message);
  }

  // Graceful server-side Gemini fallback
  try {
    const prompt = `You are Diva, a Lead Technical Instructor on the Onyx FAANG placement platform.
Chapter Title: ${chapterTitle}
Study Material / Notes: ${studyMaterial.slice(0, 1000)}
Deliver a 2-3 sentence spoken micro-briefing introducing this core engineering topic to the candidate with clarity and warmth.
Do not use any markdown formatting, bullet points, asterisks, or bold text, as your words will be read aloud by speech synthesis.`;

    const geminiRes = await genai.models.generateContent({
      model: GEMINI_MODELS.FAST,
      contents: prompt,
    });
    const text = geminiRes.text?.trim() || `Welcome to ${chapterTitle}. Let's master the core architecture together.`;
    return { success: true, data: { lecture_text: text, audio_base64: null, agent: "Diva" } };
  } catch (_geminiError: any) {
    return {
      success: true,
      data: {
        lecture_text: `Welcome to ${chapterTitle}. Let's master this topic and optimize your implementation.`,
        audio_base64: null,
        agent: "Diva"
      }
    };
  }
}

// --- ACTION 12b: CHAT WITH DIVA (THE INSTRUCTOR) ---
export async function chatWithDivaAction(
  input: string | { text: string; moduleContext?: string; chatHistory?: any[]; liveCode?: string },
  maybeContext?: string
) {
  const text = typeof input === 'string' ? input : input.text;
  const moduleContext = typeof input === 'string' ? (maybeContext || 'General Engineering') : (input.moduleContext || 'General Engineering');
  const chatHistory = typeof input === 'object' && input.chatHistory ? input.chatHistory : [];
  const liveCode = typeof input === 'object' && input.liveCode ? input.liveCode : '';

  try {
    const session = await auth();
    const candidateMemory = {
      user_name: session?.user?.name || "Candidate",
      user_id: session?.user?.id || "anonymous",
      target_company: "FAANG",
      target_role: "Software Engineer"
    };

    const finalPayload = {
      text: liveCode ? `${text}\n\n[Live Editor Buffer]:\n${liveCode}` : text,
      module_context: moduleContext,
      chat_history: chatHistory,
      candidate_memory: candidateMemory
    };

    const response = await fetch(`${BRAIN_URL}/api/chat/message`, {
      method: "POST",
      headers: brainHeaders(),
      body: JSON.stringify(finalPayload),
      signal: AbortSignal.timeout(30_000),
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }
  } catch (error: any) {
    console.warn("[chatWithDivaAction] FastAPI offline/timed out, failing over to Gemini:", error?.message);
  }

  // Graceful Gemini fallback if Python brain is down
  try {
    const systemInstruction = `[AUTHORIZATION LEVEL: LEAD INSTRUCTOR // NAME: DIVA]
You are Diva, a Lead Technical Instructor for the Onyx platform.
Current Module Curriculum: ${moduleContext}
Tone: Warm, highly articulate, encouraging, but academically rigorous.
Speak in 2 to 4 natural, conversational sentences.
Do not use markdown bullet points, bolding, or asterisks, as your text will be read aloud by speech synthesis.`;

    const contents = [
      ...chatHistory.map((m: any) => ({
        role: m.role === 'ai' ? 'model' : 'user',
        parts: [{ text: m.text || '' }]
      })),
      { role: 'user', parts: [{ text: liveCode ? `${text}\n\n[Candidate Live Code]:\n${liveCode}` : text }] }
    ];

    const geminiRes = await genai.models.generateContent({
      model: GEMINI_MODELS.FAST,
      contents,
      config: { systemInstruction }
    });

    const aiText = geminiRes.text?.trim() || "Let's keep working through this module together.";
    return {
      success: true,
      data: {
        ai_text: aiText,
        agent: "Diva",
        audio_base64: null,
        events: []
      }
    };
  } catch (geminiError: any) {
    return { success: false, error: geminiError?.message || "Diva temporarily unreachable." };
  }
}

// --- ACTION 13: CHECK ACTIVE ROADMAP STATUS ---
export async function checkUserRoadmapAction(_clientUserId?: string) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, hasRoadmap: false };
    const roadmap = await prisma.roadmap.findFirst({ where: { userId: userId } });
    return { success: true, hasRoadmap: !!roadmap };
  } catch (error: any) {
    return { success: false, hasRoadmap: false };
  }
}

// --- ACTION 14: PURGE TELEMETRY (THE NUKE) ---
export async function resetTelemetryAction(_clientUserId?: string) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Unauthorized" };
    await prisma.roadmap.deleteMany({ where: { userId: userId } });
    await prisma.user.update({ where: { id: userId }, data: { diagnosticScore: null } });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 15: INGEST CANDIDATE PROFILE (FEEDS SAM'S DOSSIER) ---
export async function ingestCandidateProfileAction(_clientUserId: string, githubUrl: string, linkedinUrl: string, rawResume: string) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Unauthorized" };
    console.log("Server Action: Hitting Python Parser Service...");
    const response = await fetch(`${BRAIN_URL}/api/profile/ingest`, {
      method: "POST",
      headers: brainHeaders(),
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
    const formattedTranscript = chatHistory
      .map(msg => `${msg.role === "ai" ? "Torii (HR)" : "Candidate"}: ${msg.text}`)
      .join("\n");

    const prompt = `You are Torii, the HR Director at Onyx. The candidate is applying for ${targetRole}.
Keep responses to 2 sentences max. Evaluate cultural fit, leadership principles, and composure. Speak naturally (no markdown or asterisks).

Chat History:
${formattedTranscript}

Your response:`;

    const completion = await genai.models.generateContent({
      model: GEMINI_MODELS.FAST,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    return { success: true, reply: completion.text?.trim() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// --- ACTION 17: EVALUATE INTERVIEW (For PostInterviewReport.tsx) ---
export async function evaluateInterviewAction(
  transcript: any[],
  targetCompany: string,
  finalCode: string,
  telemetry: any
) {
  try {
    const prompt = `You are an expert technical recruiter and architect for ${targetCompany}.
Perform a deep, rigorous evaluation of this candidate's interview transcript and final code submission. 
Telemetry: ${JSON.stringify(telemetry)}
Final Code:
${finalCode}

Interview Transcript:
${JSON.stringify(transcript, null, 2)}

Return strictly a JSON object with this exact structure:
{
  "score": <number 0-100>,
  "feedback": {
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "summary": "...",
    "cognitive_analysis": "..."
  }
}`;

    // Deep evaluation -> DEEP tier (Argon)
    const completion = await genai.models.generateContent({
      model: GEMINI_MODELS.DEEP,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' },
    });

    const responseText = completion.text?.trim() || "{}";
    const report = JSON.parse(responseText);

    return { success: true, report };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}