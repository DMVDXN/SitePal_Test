# SitePal Avatar Chat

A browser-based chat interface that combines a SitePal avatar with two chat modes:

- **Echo Mode**: the avatar repeats back exactly what the user says
- **LLM Mode**: the avatar speaks AI-generated responses from Claude

The app includes a modern split-panel layout with the avatar on the left and the chat interface on the right. It supports typed input, browser microphone input, transcript persistence, and avatar speech playback. The SitePal scene is embedded directly into the page, the UI styling is handled in CSS, and the main interaction logic lives in JavaScript. :contentReference[oaicite:0]{index=0} :contentReference[oaicite:1]{index=1}

## Features

- SitePal avatar embedded directly in the page
- Echo mode for simple repeat-back behavior
- LLM mode powered by Claude
- API key input bar for Claude mode
- Microphone input using browser speech recognition
- Chat transcript saved in `localStorage`
- Status indicator for avatar readiness and speech state
- Automatic queueing of avatar speech when another message is already being spoken
- Responsive layout for desktop and mobile screens :contentReference[oaicite:2]{index=2} :contentReference[oaicite:3]{index=3}

## Project Structure

```text
SitePal_Test/
├── index.html
├── styles.css
├── script.js
└── README.md