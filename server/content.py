"""
Text the player reads that comes from the case: the facts,
the investigation log lines and the results after an accusation.
"""
from .agents import llm


def facts(master):
    lines = [
        f"VICTIM: {master.victim}",
        f"CRIME LOCATION: {master.crime_location}",
        f"CAUSE OF DEATH: {master.cause_of_death}",
        f"TIME OF DEATH: {master.time_of_death}",
        "",
        "KNOWN CLUES:",
    ]
    lines += [f"  • {clue.get('clue', 'Unknown')}" for clue in master.clues]
    return lines


def snippet(suspect_name, transcript, existing):
    """One short observation about an interview, different from the ones we already have."""
    conversation = "\n".join(f"{speaker}: {text}" for speaker, text in transcript)
    previous = ""
    if existing:
        previous = "PREVIOUS SNIPPETS (DO NOT GENERATE SIMILAR ONES):\n" + "\n".join(f'- "{s}"' for s in existing) + "\n\n"
    prompt = f"""Analyze this interview with {suspect_name} and write ONE short suspicious or notable observation (5-7 words max).
Example: "David seemed nervous about Emma"

{previous}TRANSCRIPT:
{conversation}

IMPORTANT: The snippet MUST be completely fresh and different from any previous snippets. Focus on new observations, different aspects of the conversation, or new details mentioned. Do NOT repeat or paraphrase previous observations.

Observation:"""
    try:
        response = llm.client().chat.completions.create(
            model=llm.MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=50,
        )
        return response.choices[0].message.content.strip().strip('"')
    except Exception:
        return None


def results(master, orchestrator, accused_name):
    """What really happened, shown after the accusation."""
    murderer_name = master.case_state["murderer"]
    motive = master.case_state["murderer_motive"]
    accused = master.suspects[accused_name]
    hidden = orchestrator.get_suspect_briefing(accused_name).get("what_they_should_hide", [])
    lines = [""]

    if accused_name == murderer_name:
        lines += [
            f"CORRECT: {accused_name.upper()} IS THE MURDERER",
            "",
            f"Age: {accused['age']} | Occupation: {accused['occupation']}",
            "",
            "MOTIVE:",
            f"  {motive}",
            "",
            "METHOD:",
            f"  {master.cause_of_death}",
            f"  Location: {master.crime_location}",
            f"  Time: {master.time_of_death}",
            "",
            "KEY EVIDENCE:",
        ]
        lines += [f"  • {s}" for s in hidden[:3]] or [
            "  • False alibi that couldn't hold under scrutiny",
            "  • Motive connected to the victim",
        ]
        lines += [
            "",
            "CONFESSION:",
            f"  When confronted with the evidence, {accused_name}",
            "  admitted to the crime. They have been arrested.",
            "",
            "CASE STATUS: SOLVED",
        ]
    else:
        lines += [
            f"INCORRECT: {accused_name.upper()} IS INNOCENT",
            "",
            f"Age: {accused['age']} | Occupation: {accused['occupation']}",
            "",
            f"THE REAL MURDERER: {murderer_name.upper()}",
            "",
            "WHY YOU WERE MISLED:",
            f"  {accused_name} seemed suspicious because:",
        ]
        lines += [f"    - {s}" for s in hidden[:2]] or [
            "    - Had conflicts with the victim",
            "    - Nervous about unrelated secrets",
        ]
        lines += [
            "",
            "WHAT YOU MISSED:",
            f"  The true motive: {motive}",
            f"  This motive pointed to {murderer_name}",
            "",
            "CASE STATUS: UNSOLVED",
        ]
    return lines
