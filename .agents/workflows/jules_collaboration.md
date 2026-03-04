# Workflow: Antigravity & Jules Collaboration

This workflow ensures seamless coordination between Antigravity and Jules agents.

## Coordination Rules

1. **Branch Ownership**: 
   - Antigravity initiates the task branch.
   - Jules joins the existing branch via a Shared Session.
2. **Task Handover**:
   - Use `task.md` to signal sub-task completion.
   - Antigravity handles architectural changes; Jules focuses on implementing logic and tests.
3. **Synchronization**:
   - Always run `git pull` before generating a new tool call.
   - Antigravity will resolve any merge conflicts.

## Steps for Collaboration

1. **Initialization**:
   - Antigravity creates a new branch: `git checkout -b <branch-name>`.
   - User creates a Jules session linked to this branch.
2. **Work Phase**:
   - Antigravity outlines the plan in `implementation_plan.md`.
   - Jules implements specifically assigned components.
3. **Verification**:
   - Jules runs unit tests.
   - Antigravity performs the final build check and PR preparation.
