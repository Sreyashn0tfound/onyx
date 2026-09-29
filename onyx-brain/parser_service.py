import os
import re
import httpx
import asyncio
from typing import Dict, Any
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_groq import ChatGroq

class ProfileParserService:
    def __init__(self):
        # We use a fast, deterministic model for data extraction
        self.llm = ChatGroq(model="llama-3.3-70b-versatile", temperature=0.1)

    async def parse_github(self, github_url: str) -> Dict[str, Any]:
        """Extracts the username and fetches actual repo telemetry from GitHub API."""
        if not github_url or "github.com" not in github_url:
            return {"status": "missing", "data": None}
            
        try:
            # Extract username (e.g., https://github.com/torvalds -> torvalds)
            username = github_url.rstrip('/').split('/')[-1]
            
            async with httpx.AsyncClient() as client:
                # Fetch user data
                user_res = await client.get(f"https://api.github.com/users/{username}")
                if user_res.status_code != 200:
                    return {"status": "error", "error": "GitHub profile not found"}
                
                user_data = user_res.json()
                
                # Fetch repos to analyze tech stack
                repos_res = await client.get(f"https://api.github.com/users/{username}/repos?sort=updated&per_page=10")
                repos = repos_res.json() if repos_res.status_code == 200 else []
                
                languages = {}
                for repo in repos:
                    lang = repo.get("language")
                    if lang:
                        languages[lang] = languages.get(lang, 0) + 1
                        
            return {
                "status": "success",
                "data": {
                    "username": username,
                    "public_repos": user_data.get("public_repos", 0),
                    "followers": user_data.get("followers", 0),
                    "top_languages": sorted(languages, key=languages.get, reverse=True)[:3],
                    "recent_active_repos": len(repos)
                }
            }
        except Exception as e:
            print(f"[GitHub Parser Error]: {e}")
            return {"status": "error", "error": str(e)}

    async def parse_linkedin(self, linkedin_url: str) -> Dict[str, Any]:
        """
        LinkedIn blocks scraping. In production, connect Proxycurl API here.
        For now, we extract the slug and format it for Sam.
        """
        if not linkedin_url or "linkedin.com" not in linkedin_url:
            return {"status": "missing", "data": None}
            
        try:
            # Extract slug
            slug = linkedin_url.rstrip('/').split('/')[-1]
            return {
                "status": "success",
                "data": {
                    "linkedin_id": slug,
                    "note": "Awaiting Proxycurl/API integration for deep scrape."
                }
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}

    async def parse_resume(self, raw_text: str) -> Dict[str, Any]:
        """Uses Groq to semantically structure unstructured resume text."""
        if not raw_text or len(raw_text) < 50:
            return {"status": "missing", "data": None}

        system_prompt = """You are an elite ATS parsing engine.
        Extract the following information from the provided raw resume text.
        Output STRICT JSON with the following schema:
        {
            "core_skills": ["List of technical skills (e.g., React, Python, AWS)"],
            "years_of_experience": <integer>,
            "highest_education": "string (e.g., B.Tech Computer Science)",
            "notable_projects": ["Short 1-sentence summary of best projects"],
            "red_flags": ["List any major missing FAANG requirements (e.g., No backend experience, No system design)"]
        }"""

        try:
            response = await asyncio.to_thread(
                self.llm.invoke,
                [SystemMessage(content=system_prompt), HumanMessage(content=raw_text)]
            )
            
            # Use Groq's output to return the JSON string
            parsed_json = response.content
            import json
            return {
                "status": "success",
                "data": json.loads(parsed_json)
            }
        except Exception as e:
            print(f"[Resume Parser Error]: {e}")
            return {"status": "error", "error": str(e)}

    async def compile_candidate_dossier(self, github_url: str, linkedin_url: str, raw_resume: str) -> Dict[str, Any]:
        """
        The master orchestrator. Runs all parsers concurrently and compiles 
        the ultimate JSON dossier for Sam to store in 'profileTelemetry'.
        """
        # Run all network/LLM calls in parallel for maximum speed
        github_task = self.parse_github(github_url)
        linkedin_task = self.parse_linkedin(linkedin_url)
        resume_task = self.parse_resume(raw_resume)
        
        github_data, linkedin_data, resume_data = await asyncio.gather(
            github_task, linkedin_task, resume_task
        )
        
        dossier = {
            "github_intel": github_data.get("data", {}),
            "linkedin_intel": linkedin_data.get("data", {}),
            "resume_intel": resume_data.get("data", {})
        }
        
        return dossier

# Instantiate the singleton
parser_service = ProfileParserService()