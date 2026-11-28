# JARVIS — Personal AI Assistant (Starter)

A cross-platform starter for a personal autonomous assistant.

## Requirements
- Node.js 20 or newer
- npm
- A modern browser

## Setup
1. Install Node.js from https://nodejs.org/
2. Extract this project.
3. Open a terminal in the `jarvis-ai-assistant` folder.
4. Run `npm install`.
5. Copy `server/.env.example` to `server/.env` and add an AI provider key when ready.
6. Run `npm run dev`.
7. Open http://localhost:5173

## Current capabilities
- Chat-style command interface
- Live task status over WebSocket
- Safe demo task planner and allowlisted demo tools
- Health endpoint

## Safety
This starter does **not** run arbitrary shell commands, read private files, send messages,
make purchases, or control devices. Add those capabilities only as narrowly scoped tools
with explicit user approval for consequential actions.

## Next milestones
1. Connect an AI model through a server-side API key.
2. Add persistent task history and user authentication.
3. Add a desktop companion with explicit screen/control permissions.
4. Add an Android companion app with Android's permission model.
5. Add approval gates, audit logs, and a kill switch.

Never put API keys in the React frontend or commit `.env` files.
