# AI_CODING_RULES.md — How We Code With AI

Everyone on this team uses AI to write code, and that's fine — but a codebase four people build with AI in a month, then hand to three for QA, only survives if the AI is kept on a short leash. These rules apply to every commit, whether a human or an assistant wrote it. If AI output violates one of these, it doesn't get committed.

Why this matters specifically for us: Shashank and Purven leave after Month 1. Any over-engineered, speculative, or sprawling code they leave behind becomes someone else's debugging nightmare in Month 2. Simple and traceable beats clever and broad, every time.

---

## 1. Think before coding
- State your assumptions out loud (in the PR description or a comment) before writing code.
- If the request is ambiguous, ask exactly **one** clarifying question and wait — don't guess and build.
- If a simpler approach exists, say so and push back before implementing the complex one.
- The moment you're confused, stop and name what's unclear. Guessing produces code no one can maintain.

## 2. Simplicity first
- Write the minimum code that solves *exactly* this task. Nothing speculative.
- No abstractions "for later", no config flags nobody asked for, no generic frameworks around a one-off need.
- **Test:** if a senior engineer would call it overcomplicated, simplify it.
- For us that means: don't let the AI generate a 300-line "flexible" module when a 40-line one does the job. It will try. Cut it back.

## 3. Surgical changes
- Touch only what the task requires.
- Don't "improve" or reformat neighbouring code unless explicitly told to.
- Don't refactor code that works.
- Every changed line must trace back to the stated task. If you can't explain why a line changed, revert it.
- This keeps PRs small and reviewable — essential when two authors are about to disappear.

## 4. Goal-driven execution
- Turn a vague instruction into a clear, verifiable target *before* coding (e.g., "write tests for invalid inputs, then make them pass").
- Define success criteria up front.
- Before marking anything done, confirm it actually meets the goal — not just "the AI said it's done".

---

## How this plugs into our workflow
- **Assumptions go in the PR.** A reviewer should see what the author (or the AI) assumed, so wrong assumptions get caught at review, not in Month 2.
- **PRs stay small.** Rule 3 makes this natural. A giant AI-generated diff is a red flag, not progress.
- **No solo-owned code.** Combined with the sprint rule that every module is PR-reviewed, this is our defence against the two departures.
- **Tests are part of "done".** Rule 4 plus the Month-2 QA plan means features ship with the criteria that prove them.
- **When AI and the spec disagree, the spec wins.** ARCHITECTURE.md and PLAN.md are the source of truth. If AI suggests a "better" data model or an out-of-scope feature, check it against those docs first.

## Prompting note
When you hand a task to an AI assistant, give it the relevant slice of ARCHITECTURE.md and the specific acceptance criteria, and tell it these four rules apply. A scoped prompt with success criteria produces code that follows these rules by default; a vague prompt produces exactly the sprawling, speculative output these rules exist to stop.
