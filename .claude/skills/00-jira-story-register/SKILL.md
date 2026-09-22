---
name: 00-jira-story-register
description: "Read and validate the markdown JIRA story register. Use when listing queued stories, inspecting a parsed story, or checking the story-file contract."
argument-hint: "[--full | --story JIRA-001]"
---

# JIRA Story Register

Canonical instructions and zero-dependency scripts are in `.github/skills/00-jira-story-register/`.

Read `.github/skills/00-jira-story-register/SKILL.md` before acting. It defines the read-only story-file contract, parsing, and lookup helpers.

Run its scripts from that canonical folder. Never write a `docs/agent_output/00-jira-stories/jira-story-*.md` file unless the user explicitly asks to add or change a story.