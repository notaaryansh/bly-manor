import os
import json
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


class AgentOrchestrator:
    """
    Master orchestrator that manages narrative consistency across all suspect agents.
    Ensures that:
    1. Clues are contextually distributed (only people involved know about them)
    2. Story is coherent and leads to the murderer
    3. Agents give hints that converge toward the solution
    4. Relationships and motives are consistent
    """

    def __init__(self, case_state, suspects, relationships, clues):
        self.case_state = case_state
        self.suspects = suspects
        self.relationships = relationships
        self.clues = clues
        self.murderer = case_state["murderer"]
        self.victim = case_state["victim"]
        self.motive = case_state["murderer_motive"]


    def get_suspect_briefing(self, suspect_name):
        """
        Get a briefing for a specific suspect about what they should know
        and how they should behave in interviews
        """
        briefing = {
            "suspect_name": suspect_name,
            "role": self._determine_role(suspect_name),
            "what_they_know": self._get_suspect_knowledge(suspect_name),
            "what_they_should_hide": self._get_suspect_secrets(suspect_name),
            "relationships_context": self._get_relationship_context(suspect_name),
            "likely_questions": self._predict_likely_questions(suspect_name),
            "defensive_topics": self._identify_defensive_topics(suspect_name),
            "hintable_facts": self._generate_hintable_facts(suspect_name),
        }
        return briefing

    def _get_likely_accusations(self, suspect_name):
        """Get what accusations this innocent suspect might face"""
        accusations = []

        # Check for conflicts with victim
        for pair, rel_type in self.relationships.items():
            if suspect_name in pair and self.victim in pair:
                if rel_type in ["Rival", "Enemy"]:
                    accusations.append(f"Had conflict with {self.victim}")

        # Check if they might know damaging information
        for clue in self.clues:
            if clue.get("known_by") == suspect_name and not clue.get("is_true"):
                accusations.append(f"Spreading false rumors")

        return accusations

    def _determine_role(self, suspect_name):
        """Determine the suspect's role in the narrative"""
        if suspect_name == self.murderer:
            return "murderer"
        elif suspect_name == self.victim:
            return "victim"
        else:
            return "innocent_suspect"

    def _get_suspect_knowledge(self, suspect_name):
        """Get what a suspect should know"""
        knowledge = []

        # They know their own alibi
        knowledge.append(f"Their alibi: {self.suspects[suspect_name]['alibi']}")

        # They know about clues they're listed as knowing
        for clue in self.clues:
            if clue.get("known_by") == suspect_name:
                knowledge.append(f"Clue: {clue.get('clue', '')}")

        # They might know about related clues through relationships
        for pair, rel_type in self.relationships.items():
            if suspect_name in pair and rel_type in ["Close Friend", "Romantic Partner"]:
                other = pair.split("_")[0] if pair.split("_")[1] == suspect_name else pair.split("_")[1]
                for clue in self.clues:
                    if clue.get("known_by") == other:
                        knowledge.append(f"Might know through {other}: {clue.get('clue', '')}")

        return knowledge

    def _get_suspect_secrets(self, suspect_name):
        """Get what a suspect should try to hide"""
        secrets = []

        # Murderer hides everything about the crime
        if suspect_name == self.murderer:
            secrets.append(f"Their guilt in killing {self.victim}")
            secrets.append(f"Their motive: {self.motive}")
            for clue in self.clues:
                if clue.get("is_true") and clue.get("known_by") == suspect_name:
                    secrets.append(f"Evidence: {clue.get('clue', '')}")

        # Everyone hides things that might incriminate them
        for clue in self.clues:
            if clue.get("known_by") == suspect_name and not clue.get("is_true"):
                secrets.append(f"False rumor: {clue.get('clue', '')}")

        return secrets

    def _get_relationship_context(self, suspect_name):
        """Get relationship context for a suspect"""
        context = {}
        for pair, rel_type in self.relationships.items():
            if suspect_name in pair:
                other = pair.split("_")[0] if pair.split("_")[1] == suspect_name else pair.split("_")[1]
                context[other] = rel_type
        return context

    def _predict_likely_questions(self, suspect_name):
        """Predict what questions the detective might ask"""
        questions = [
            f"Where were you when {self.victim} was killed?",
            f"What's your relationship with {self.victim}?",
            f"Did you see anyone suspicious?",
            f"What do you know about {self.victim}?",
        ]

        # Add motive-specific questions
        if "jealousy" in self.motive.lower():
            for pair, rel_type in self.relationships.items():
                if rel_type == "Romantic Partner":
                    questions.append(f"What's your relationship status?")

        return questions

    def _identify_defensive_topics(self, suspect_name):
        """Identify topics the suspect will be defensive about"""
        defensive = []

        # Topics related to their role in the crime
        if suspect_name == self.murderer:
            defensive.append(self.victim)
            defensive.append("alibi")
            defensive.append("whereabouts")

        # Topics related to accusations against them
        for false_motive in self._get_likely_accusations(suspect_name):
            defensive.append(false_motive)

        return defensive

    def _generate_hintable_facts(self, suspect_name):
        """
        Use LLM to generate 2-3 contextually relevant hintable facts for this suspect.
        These are facts they know about and might reveal if questioned correctly.
        """
        suspect = self.suspects[suspect_name]
        role = self._determine_role(suspect_name)

        # Build context about this suspect
        context = f"""
SUSPECT: {suspect_name} ({suspect['age']} year old {suspect['gender']} {suspect['occupation']})
ROLE: {role.upper()}
VICTIM: {self.victim}
MURDERER: {self.murderer}
MOTIVE: {self.case_state.get('murderer_motive', 'unknown')}

RELATIONSHIPS WITH OTHER SUSPECTS:
"""
        for pair, rel_type in self.relationships.items():
            if suspect_name in pair:
                other = pair.split("_")[0] if pair.split("_")[1] == suspect_name else pair.split("_")[1]
                context += f"  - {other}: {rel_type}\n"

        context += f"\nKNOWN CLUES:\n"
        for clue in self.clues:
            if clue.get("known_by") == suspect_name:
                context += f"  - {clue.get('clue', '')}\n"

        prompt = f"""You are a detective briefing assistant. Generate 2-3 specific, hintable facts that {suspect_name} might reveal during interrogation if the detective asks the right questions or treats them well.

{context}

These hintable facts should be:
1. CONTEXTUALLY RELEVANT: Based on their relationships, role, and what they know
2. SPECIFIC: Not vague - include names, times, or concrete details when possible
3. REVEALABLE: Things they would naturally know and might slip up about
4. USEFUL: Facts that would help solve the mystery (clues, observations, suspicious behavior)

For a {role}:
- If MURDERER: Include details they might slip up about (location, time, interactions with victim)
- If INNOCENT: Include gossip about others, suspicious observations, relationship conflicts

Return ONLY a JSON array of 2-3 facts (strings), no other text. Example format:
["saw Lisa leave study at 11:45pm", "heard arguing between James and victim", "found key to study room"]
"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=0.8,
                max_tokens=300
            )

            import json
            facts_json = response.choices[0].message.content.strip()
            hintable_facts = json.loads(facts_json)
            return hintable_facts if isinstance(hintable_facts, list) else []
        except Exception as e:
            # Fallback: return empty list if generation fails
            return []
