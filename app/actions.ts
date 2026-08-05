'use server';

import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import prisma from '../lib/db'; 
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import bcrypt from 'bcryptjs'; // <-- NEW: Injected for secure password hashing

const ai = new GoogleGenAI({});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY }); 

// --- ACTION 1: GENERATE MODULAR ROADMAP & SAVE TO DB ---
export async function generateRoadmapAction(formData: any, hasResume: boolean, userId: string, userEmail: string) {
  try {
    const systemPrompt = `You are Onyx, a brutal, elite FAANG engineering architect generating a master curriculum.
    
    USER PROFILE:
    Target Role: ${formData.targetRole} at ${formData.targetCompany}.
    Current Year: ${formData.currentYear}.
    Missing ATS Skills: ${hasResume ? formData.missingSkills : "None. Assume absolute beginner."}.

    THE DIFFICULTY SCALING RULE:
    - You must adjust the DIFFICULTY of the curriculum based on the user's Current Year and ATS Skills, but the SIZE of the course remains fixed.
    - If "1st Year" or "2nd Year": Focus on core foundations, data structures, and basic algorithms.
    - If "3rd Year", "4th Year", or "Graduated": Skip the basics. Make the questions heavily focused on advanced FAANG patterns, system design, and brutal edge cases.

    THE MANDATORY STRUCTURE RULE (CRITICAL - DO NOT TRUNCATE):
    You MUST adhere to this exact mathematical structure.
    1. You MUST generate EXACTLY 5 Modules.
    2. Inside EACH Module, you MUST generate EXACTLY 3 chapters (nodes). (Total of 15 chapters).
    3. Inside EACH chapter, you MUST provide EXACTLY 3 escalating questions in the "assignment_prompts" array. (Total of 45 questions).

    THE TOPIC-RELEVANCE & QUESTION VARIETY RULE (CRITICAL):
    - The questions inside "assignment_prompts" MUST perfectly match the specific topic of that chapter. Do not ask generic questions. If the node is about "Binary Trees", all 3 questions must be about Binary Trees.
    - If the chapter topic is Data Structures, Algorithms, or Core Programming, the 3 questions MUST be LeetCode-style coding challenges.
    - If the chapter topic is System Design, Cloud, or Architecture, the 3 questions MUST be conceptual whiteboard/design prompts (e.g., "Design a distributed rate limiter"). Do NOT ask them to write code for System Design questions.

    Inside EVERY chapter, the 3 questions MUST escalate in difficulty:
    - Q1: (Warm-up) Easy foundation testing the core concept.
    - Q2: (Optimization) Medium difficulty requiring pattern recognition or trade-off analysis.
    - Q3: (Boss Fight) Hard FAANG-level variant with strict edge cases or Big-O constraints.

    THE DUAL-TRACK RESOURCES RULE:
    You MUST output a "learning_resources" object containing two arrays tailored specifically to the target role and company:
    1. "free_track": Exactly 3 highly specific, zero-cost resources.
    2. "premium_track": Exactly 3 enterprise-grade paid resources.

    THE INFINITY SAGA RULE:
    You MUST output a "gauntlet_map" object. The user must collect 6 stones (the 5 Modules + 1 Final HR Interview). Each stone must be assigned a unique color, a name, and its corresponding module ID.

    You MUST output valid JSON in this EXACT structure:
    {
      "jobProfile": {
        "title": "${formData.targetRole} at ${formData.targetCompany}",
        "description": "A 3-sentence exciting overview of what this role actually does.",
        "expectedSalary": "e.g., ₹12,00,000 - ₹18,00,000",
        "requiredSkills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"]
      },
      "gauntlet_map": {
        "power_stone": { "color": "Purple", "module_id": 1, "unlocked": false },
        "space_stone": { "color": "Blue", "module_id": 2, "unlocked": false },
        "reality_stone": { "color": "Red", "module_id": 3, "unlocked": false },
        "soul_stone": { "color": "Orange", "module_id": 4, "unlocked": false },
        "time_stone": { "color": "Green", "module_id": 5, "unlocked": false },
        "mind_stone": { "color": "Yellow", "module_id": 6, "unlocked": false }
      },
      "learning_resources": {
        "free_track": [
          {"type": "YouTube Course", "title": "Full 12-Hour System Design Prep", "search_term": "System design full course", "link": ""}
        ],
        "premium_track": [
          {"type": "Industry Certification", "title": "AWS Certified Solutions Architect", "cost": "$150 USD"}
        ]
      },
      "modules": [
        {
          "module_id": 1,
          "module_title": "Phase 1: [Topic]",
          "module_description": "What they will learn in this module.",
          "chapters": [
            {
              "title": "Node 1: [Sub-Topic]",
              "notes": "One dense, highly technical paragraph explaining the core concept.",
              "youtube_search_term": "Detailed technical lecture on [Sub-Topic]",
              "assignment_prompts": [
                "1. (Warm-up): [Highly relevant easy question]",
                "2. (Optimization): [Highly relevant medium question]",
                "3. (Boss Fight): [Highly relevant FAANG-hard question]"
              ]
            }
          ]
        }
      ]
    }`;

    console.log("Server Action: Generating Modular Curriculum & 3D Vector Map via Groq...");

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate the curriculum for ${formData.targetRole} at ${formData.targetCompany}. DO NOT truncate the JSON output. Generate all 5 modules, all 3 chapters per module, all 3 coding questions per chapter, the learning tracks, and the gauntlet_map.` }
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" }, 
      max_tokens: 8000, 
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "{}";
    const gameData = JSON.parse(responseText);

    let globalChapterId = 1;
    const dbNodes: any[] = [];

    gameData.modules?.forEach((mod: any) => {
      mod.chapters?.forEach((chapter: any) => {
        chapter.id = globalChapterId;
        
        let combinedPrompts = "";
        
        // Hardened Parsing Logic
        if (Array.isArray(chapter.assignment_prompts) && chapter.assignment_prompts.length > 0) {
          const validPrompts = chapter.assignment_prompts.filter((p: string) => p.trim().length > 5);
          combinedPrompts = validPrompts.join('\n\n');
        } else if (typeof chapter.assignment_prompts === 'string' && chapter.assignment_prompts.length > 5) {
          combinedPrompts = chapter.assignment_prompts;
        } else if (chapter.assignment_prompt) {
          combinedPrompts = Array.isArray(chapter.assignment_prompt) ? chapter.assignment_prompt.join('\n\n') : chapter.assignment_prompt;
        }

        if (!combinedPrompts || combinedPrompts.trim() === "") {
          combinedPrompts = `1. (Warm-up) Define the optimal approach for ${chapter.title || 'this topic'}.\n\n2. (Optimization) Explain the trade-offs of your approach.\n\n3. (Boss Fight) Optimize the architecture to pass FAANG constraints.`;
        }

        dbNodes.push({
          sequenceIndex: globalChapterId,
          phaseTitle: mod.module_title || `Phase`,
          chapterTitle: chapter.title || "Untitled Node",
          notes: chapter.notes || "Review standard documentation for this topic.",
          assignmentPrompt: combinedPrompts,
          youtubeSearchTerm: chapter.youtube_search_term || `${formData.targetRole} ${formData.targetCompany} ${chapter.title} prep`,
          status: globalChapterId === 1 ? 'UNLOCKED' : 'LOCKED'
        });

        globalChapterId++;
      });
    });

    // --- SAVE TO DATABASE VIA PRISMA ---
    try {
      const user = await prisma.user.upsert({
        where: { id: userId },
        update: { targetCompany: formData.targetCompany, targetRole: formData.targetRole },
        create: {
          id: userId,
          email: userEmail,
          name: 'Future 1Cr Earner',
          targetCompany: formData.targetCompany,
          targetRole: formData.targetRole,
          degree: formData.degree || 'B.Tech',
          currentYear: formData.currentYear
        },
      });

      // CRITICAL FIX: Wipe the old corrupted roadmap from the DB so the new one loads cleanly
      await prisma.roadmap.deleteMany({ where: { userId: user.id } });

      await prisma.roadmap.create({
        data: {
          userId: user.id,
          title: gameData.jobProfile?.title || `${formData.targetRole} at ${formData.targetCompany}`,
          expectedSalary: gameData.jobProfile?.expectedSalary || "Market Standard",
          description: gameData.jobProfile?.description || "",
          requiredSkills: gameData.jobProfile?.requiredSkills || [],
          nodes: {
            create: dbNodes
          }
        }
      });
      console.log("Server Action: Roadmap successfully saved to Database!");
    } catch (dbError) {
      console.error("Database Save Error:", dbError);
    }

    return { success: true, gameData };
    
  } catch (error: any) {
    console.error("Roadmap Generation Error:", error);
    return { success: false, error: error.message };
  }
}

// --- ACTION 2: THE AUTO-GRADER (ADAPTIVE NEURO-SYMBOLIC EDITION) ---
export async function gradeAssignmentAction(
  code: string, 
  questionPrompt: string, 
  targetCompany: string
) {
  try {
    console.log("Server Action: Engaging Adaptive Neuro-Symbolic Grader...");

    let maxLoopDepth = 0;
    let astSuccess = false;
    let calculatedTimeComplexity = "N/A";

    try {
      const ast = acorn.parse(code, { ecmaVersion: 2024, sourceType: "module" });
      astSuccess = true;

      walk.ancestor(ast, {
        ForStatement(node: any, state: any, ancestors: any) { countDepth(ancestors); },
        WhileStatement(node: any, state: any, ancestors: any) { countDepth(ancestors); },
        DoWhileStatement(node: any, state: any, ancestors: any) { countDepth(ancestors); },
        ForOfStatement(node: any, state: any, ancestors: any) { countDepth(ancestors); },
        ForInStatement(node: any, state: any, ancestors: any) { countDepth(ancestors); }
      });

      function countDepth(ancestors: any[]) {
        const loopTypes = ['ForStatement', 'WhileStatement', 'DoWhileStatement', 'ForOfStatement', 'ForInStatement'];
        const currentDepth = ancestors.filter((n: any) => loopTypes.includes(n.type)).length;
        if (currentDepth > maxLoopDepth) maxLoopDepth = currentDepth;
      }

      if (maxLoopDepth === 0) calculatedTimeComplexity = "O(1) or O(log n)";
      if (maxLoopDepth === 1) calculatedTimeComplexity = "O(n)";
      if (maxLoopDepth >= 2) calculatedTimeComplexity = `O(n^${maxLoopDepth})`;

    } catch (err: any) {
      console.log("AST Parser skipped: Input is likely plain text, Python, SQL, or pseudocode.");
    }

    const astContext = astSuccess 
      ? `[CRITICAL NEURO-SYMBOLIC DATA]
         Our backend AST parser has mathematically analyzed the student's code.
         - MAXIMUM LOOP DEPTH: ${maxLoopDepth}
         - CALCULATED TIME COMPLEXITY: ${calculatedTimeComplexity}
         You MUST accept this Time Complexity as absolute truth.`
      : `[CONTEXT]
         The user submitted a text-based, system design, or non-JS code answer. 
         Evaluate their logic, architecture, or code syntax normally. Estimate the Time/Space complexity if applicable, or output "N/A" if it's a conceptual/system design answer.`;

    const systemPrompt = `You are the lead Onyx technical evaluator for ${targetCompany}.
    You are grading a student's submission based on this prompt: "${questionPrompt}"
    
    ${astContext}
    
    RULES:
    1. Be brutal, Socratic, and concise. Talk like a senior engineer.
    2. If it is a System Design question, check if they mentioned key concepts (Load Balancers, Caching, DB Replication, etc.).
    
    Output strictly in JSON:
    {
      "passed": <boolean>,
      "score": <number 0-100>,
      "feedback": "<string, max 3 sentences explaining the architectural flaws or praising the optimization.>",
      "metrics": {
        "timeComplexity": "<string, or N/A>",
        "spaceComplexity": "<string, or N/A>"
      }
    }`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Evaluate this submission: \n\n${code}` }
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" }, 
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "{}";
    const report = JSON.parse(responseText);

    console.log(`Server Action: Grader complete. AI Score: ${report.score}`);

    return { success: true, result: report };
    
  } catch (error: any) {
    console.error("Adaptive Grader Error:", error);
    return { success: false, error: error.message };
  }
}

// --- ACTION 3: THE GROQ TEXT-ONLY ATS SCANNER ---
export async function analyzeResumeAction(extractedText: string, targetRole: string) {
  try {
    console.log("Server Action: Received raw text from browser. Routing to Groq...");

    if (!extractedText || extractedText.trim() === "") {
        throw new Error("Onyx Scanner failed: No readable text found.");
    }

    const systemPrompt = `You are an elite ATS (Applicant Tracking System) and Onyx technical recruiter.
    Analyze the following extracted text from a student's resume against the target role: ${targetRole}.
    
    1. Determine if this text is actually a resume/CV. If it is random text, set "is_resume" to false.
    2. Extract their current core skills.
    3. Roast it. Give a harsh, witty, Socratic critique of why this resume would get thrown in the trash at FAANG.
    4. Provide exactly 3 actionable steps to improve it.
    
    Output STRICT JSON. Escape all newlines and quotes properly.
    {
      "is_resume": boolean,
      "rejection_reason": "If false, explain why harshly. If true, leave empty.",
      "overall_ats_score": <number 0-100>,
      "roast": "A harsh, witty FAANG recruiter critique. Max 3 sentences.",
      "improvement_plan": ["Step 1", "Step 2", "Step 3"],
      "missing_ats_keywords": ["keyword1", "keyword2", "keyword3"]
    }`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `RESUME TEXT:\n\n${extractedText}` }
      ],
      model: "llama-3.3-70b-versatile", 
      response_format: { type: "json_object" }, 
    });

    console.log("Server Action: Groq Resume Scan Complete!");
    
    const responseText = chatCompletion.choices[0]?.message?.content || "{}";
    const scanResult = JSON.parse(responseText);

    return { success: true, result: scanResult };
    
  } catch (error: any) {
    console.error("Groq Resume Scan Error:", error.message);
    return { success: false, error: error.message || "Failed to scan via Groq" };
  }
}

// --- ACTION 4: THE SOCRATIC RESUME BUILDER (FRIENDLY GOOD COP - GROQ EDITION) ---
export async function buildResumeChatAction(
  chatHistory: { role: string; text: string }[], 
  targetRole: string,
  targetCompany: string
) {
  try {
    const historyText = chatHistory.map(msg => `${msg.role === 'user' ? 'STUDENT' : 'MENTOR'}: ${msg.text}`).join("\n\n");
    
    const systemPrompt = `You are a warm, friendly, and highly supportive Onyx placement mentor. You are chatting with a student to help them build a FAANG-level resume specifically tailored for a ${targetRole} role at ${targetCompany}.
    
    RULES:
    1. Tone: Be incredibly encouraging, empathetic, and friendly. Build their confidence! Use emojis.
    2. If the student has provided less than 3 responses, ask ONE gentle, guiding question to help them talk about their projects, impact, metrics, or tech stack.
    3. If you have enough info (3+ student responses), generate the final resume.
    4. The generated resume MUST bypass AI detectors: Use high burstiness and the strict XYZ formula (Accomplished [X] as measured by [Y], by doing [Z]).
    5. THE PDF HTML PROTOCOL: The final resume MUST be returned as a beautifully formatted, ATS-friendly HTML string. Use semantic tags (<h1>, <h2>, <ul>, <li>) and inline CSS (Apple-like aesthetic: white background, black text, modern sans-serif fonts, sharp margins) for direct PDF export.
    
    CURRENT CHAT LOG:
    ${historyText}
    
    Output STRICT JSON:
    {
      "is_complete": <boolean>,
      "next_question": "<string or empty>",
      "final_resume_html": "<string or empty>",
      "missing_ats_keywords": ["<keyword1>", "<keyword2>"],
      "overall_ats_score": <number 90-100>
    }`;

    console.log(`Server Action: Groq Resume Builder engaged for ${targetCompany}...`);

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Process the chat history and provide the next step in JSON." }
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "{}";
    const buildResult = JSON.parse(responseText);

    console.log("Server Action: Onyx Builder successfully processed via Groq!");

    return { success: true, result: buildResult };
    
  } catch (error: any) {
    console.error("Resume Builder Groq Error:", error.message);
    return { success: false, error: error.message || "Failed to process resume chat via Groq." };
  }
}

// --- ACTION 5: THE AI HR INTERVIEWER (TECHNICAL) ---
export async function conductInterviewAction(
  chatHistory: { role: string; text: string }[], 
  targetRole: string
) {
  try {
    const systemPrompt = `You are a strict, professional FAANG technical interviewer named 'Onyx'.
    You are interviewing a candidate for a ${targetRole} position via a voice call.
    
    RULES:
    1. Keep your responses short and conversational (1-3 sentences max). This is a spoken voice call, so do not use markdown, bullet points, or complex code blocks.
    2. Ask one technical or behavioral question at a time.
    3. Wait for the candidate's answer. 
    4. Briefly acknowledge their answer (critique or validate it), then ask the next question.
    5. Be slightly intimidating but professional.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory.map(msg => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.text
      }))
    ];

    console.log("Hitting Groq for Technical Interview...");

    const chatCompletion = await groq.chat.completions.create({
      messages: messages as any,
      model: "llama-3.3-70b-versatile", 
    });

    return { 
      success: true, 
      reply: chatCompletion.choices[0]?.message?.content || "Could you repeat that?" 
    };
    
  } catch (error: any) {
    console.error("GROQ TECH INTERVIEW ERROR:", error.message);
    return { success: false, error: error.message };
  }
}

// --- ACTION 6: GENERATE FINAL INTERVIEW REPORT & SAVE TO DB ---
export async function evaluateInterviewAction(
  chatHistory: any[], 
  targetRole: string, 
  isGeneralHR: boolean = false,
  userId: string,
  biometrics: { hesitationCount: number; maxLatency: number } = { hesitationCount: 0, maxLatency: 0 }
) {
  try {
    // 🔥 THE GHOSTING FIX: Check if the user actually said anything!
    const userSpoke = chatHistory.some(msg => msg.role === 'user');
    
    if (!userSpoke) {
      console.log("Candidate ghosted the interview. Auto-failing.");
      return { 
        success: true, 
        report: {
          score: 0,
          summary: "The candidate failed to participate in the interview. No communication was established.",
          strengths: ["Punctual (Showed up)"],
          weaknesses: ["Zero communication", "Abandoned the interview", "Failed to answer any questions"],
          cognitive_analysis: "Candidate completely froze or abandoned the terminal, resulting in an automatic failure."
        } 
      };
    }

    const biometricContext = `
    BIOMETRIC TELEMETRY (COGNITIVE LOAD):
    - Lexical Hesitations (umms/uhhs/pauses): ${biometrics.hesitationCount}
    - Maximum Response Latency: ${(biometrics.maxLatency / 1000).toFixed(1)} seconds
    
    If hesitations > 3, brutally note their lack of confidence and poor communication flow.
    If latency > 2.0 seconds, note their slow processing speed under pressure. 
    Factor these metrics into the final score.`;

    const systemPrompt = `You are the lead technical recruiter for Onyx. 
    Review the following mock interview transcript for a ${targetRole} position.
    ${biometricContext}
    
    You MUST output valid JSON in this exact structure:
    {
      "score": <number between 0 and 100>,
      "summary": "A 2-sentence brutal but fair summary of their technical and behavioral performance.",
      "strengths": ["string", "string", "string"],
      "weaknesses": ["string", "string", "string"],
      "cognitive_analysis": "A 1-sentence brutal analysis of their confidence under pressure based strictly on their biometric latency and hesitation data."
    }`;

    console.log("Server Action: Evaluating Interview with Biometrics via Groq...");

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(chatHistory) }
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" }, 
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "{}";
    const report = JSON.parse(responseText);

    return { success: true, report };
    
  } catch (error: any) {
    console.error("Evaluation Error:", error);
    return { success: false, error: error.message };
  }
}

// --- ACTION 7: YOUTUBE MOST-VIEWED VIDEO FETCHER ---
export async function getYouTubeVideoAction(query: string) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    if (!apiKey) {
      console.log("No YouTube API Key found. Returning placeholder video.");
      return { success: true, videoId: "pkYVOmU3MgA" }; 
    }

    console.log(`Searching YouTube for: ${query} (Filtering Shorts, demanding long videos)`);
    
    const modifiedQuery = query + " -shorts";
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(modifiedQuery)}&type=video&videoDuration=long&order=viewCount&key=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      return { success: true, videoId: data.items[0].id.videoId };
    } else {
      throw new Error("No videos found.");
    }
    
  } catch (error: any) {
    console.error("YouTube Fetch Error:", error);
    return { success: false, videoId: "pkYVOmU3MgA" }; 
  }
}

// --- ACTION 8: GENERAL HR & COMMUNICATION INTERVIEW ---
export async function conductGeneralHRAction(
  chatHistory: { role: string; text: string }[], 
  targetRole: string,
  userData?: { resumeSummary: string, github: string, linkedin: string } 
) {
  try {
    const systemPrompt = `You are 'Onyx HR', an elite, slightly intimidating FAANG HR Manager. 
    You are evaluating a candidate for a ${targetRole} position.

    CANDIDATE TELEMETRY:
    Resume/Skills: ${userData?.resumeSummary || 'No resume provided.'}
    GitHub: ${userData?.github || 'No GitHub provided.'}
    LinkedIn: ${userData?.linkedin || 'No LinkedIn provided.'}

    YOUR DIRECTIVES:
    1. If this is the start of the conversation, immediately rate their profile/resume based on FAANG standards (be brutally honest but professional), then ask your first question.
    2. If they provided a GitHub or LinkedIn, ask them to explain a specific project or gap in their experience.
    3. Keep your responses short, conversational, and spoken-word friendly (1-3 sentences max).
    4. Ask ONLY one question at a time and wait for their response.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory.map(msg => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.text
      }))
    ];

    console.log("Hitting Groq for HR Interview...");

    const chatCompletion = await groq.chat.completions.create({
      messages: messages as any,
      model: "llama-3.3-70b-versatile", 
    });

    return { 
      success: true, 
      reply: chatCompletion.choices[0]?.message?.content || "I missed that. Could you repeat?" 
    };
    
  } catch (error: any) {
    console.error("GROQ HR INTERVIEW ERROR:", error.message);
    return { success: false, error: error.message };
  }
}

// --- ACTION 9: FETCH ACTIVE ROADMAP FROM DATABASE ---
export async function getUserRoadmapAction(userId: string) {
  try {
    const roadmap = await prisma.roadmap.findFirst({
      where: { userId: userId }, 
      include: { 
        nodes: {
          orderBy: { sequenceIndex: 'asc' } 
        } 
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!roadmap) {
      return { success: false, message: "No active roadmap found." };
    }

    return { success: true, roadmap };
    
  } catch (error: any) {
    console.error("DB Fetch Error:", error);
    return { success: false, error: error.message };
  }
}

// --- ACTION 10: SAVE CODE SUBMISSION & UNLOCK NEXT NODE ---
export async function saveCodeSubmissionAction(
  sequenceIndex: number, 
  codeWritten: string, 
  aiFeedback: string, 
  score: number, 
  passed: boolean, 
  userId: string
) {
  try {
    const roadmap = await prisma.roadmap.findFirst({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      include: { nodes: true } 
    });

    if (!roadmap) throw new Error("No roadmap found for user");

    const targetNode = roadmap.nodes.find(n => n.sequenceIndex === sequenceIndex);
    if (!targetNode) throw new Error("Target node not found in roadmap");

    await prisma.codeSubmission.create({
      data: {
        userId: userId,
        nodeId: targetNode.id,
        codeWritten: codeWritten,
        aiFeedback: aiFeedback,
        score: score,
        passed: passed
      }
    });

    if (passed) {
      await prisma.roadmapNode.update({
        where: { id: targetNode.id },
        data: {
          status: 'CLEARED' 
        }
      });

      await prisma.roadmapNode.updateMany({
        where: {
          roadmapId: roadmap.id,
          sequenceIndex: sequenceIndex + 1,
          status: 'LOCKED'
        },
        data: {
          status: 'UNLOCKED'
        }
      });
    }

    return { success: true };
  } catch (error) {
    console.error("DB Save Submission Error:", error);
    return { success: false, error };
  }
}

// --- ACTION 11: GROQ WHISPER SPEECH-TO-TEXT ---
export async function transcribeAudioAction(formData: FormData) {
  try {
    const audioFile = formData.get("audio") as File;
    
    if (!audioFile) {
      throw new Error("No audio file received.");
    }

    console.log("Server Action: Routing Audio to Groq Whisper...");

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3",
      // This prompt forces Whisper to keep hesitations and filler words!
      prompt: "Umm, let me think. Uh, the architecture is, ah, quite complex.", 
      response_format: "json",
    });

    return { success: true, text: transcription.text };
    
  } catch (error: any) {
    console.error("Whisper Error:", error.message);
    return { success: false, error: error.message };
  }
}

// --- ACTION 13: THE BLACK HOLE (ENDLESS LEETCODE GENERATOR) ---
export async function generateArenaQuestionAction(difficulty: string) {
  try {
    const systemPrompt = `You are the Onyx Arena Master. 
    Generate a random, highly specific LeetCode-style data structures and algorithms coding question.
    Difficulty requested: ${difficulty} (Warm-up, Optimization, or Boss Fight).
    
    Output STRICT JSON:
    {
      "title": "The name of the problem",
      "prompt": "The full markdown description of the problem, including constraints and 2 test cases (Input/Output)."
    }`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" }, 
    });

    const responseText = chatCompletion.choices[0]?.message?.content || "{}";
    const question = JSON.parse(responseText);

    return { success: true, question };
  } catch (error: any) {
    console.error("Arena Generation Error:", error.message);
    return { success: false, error: error.message };
  }
}

// --- ACTION 14: SECURE USER SIGNUP (AUTH.JS / NEON EDITION) ---
export async function signUpAction(formData: FormData) {
  try {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const name = formData.get('fullName') as string;

    if (!email || !password || !name) {
      return { success: false, error: "Missing required telemetry fields." };
    }

    // 1. Check if the candidate already exists in the Neon DB
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { success: false, error: "A profile with this Auth Sync ID already exists." };
    }

    // 2. Encrypt the password (Cost factor 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Forge the user in the database
    await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        // Give them some default setup so the DB doesn't complain later
        targetCompany: "FAANG",
        targetRole: "Software Engineer",
      }
    });

    console.log(`Server Action: Successfully forged new user profile for ${email}`);
    return { success: true };

  } catch (error: any) {
    console.error("Sign up error:", error);
    return { success: false, error: "Critical database insertion failure." };
  }
}