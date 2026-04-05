const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_KEY;

const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const statusText = document.getElementById("statusText");
const echoModeBtn = document.getElementById("echoModeBtn");
const llmModeBtn = document.getElementById("llmModeBtn");
const chatTitle = document.getElementById("chatTitle");
const chatSub = document.getElementById("chatSub");

let sitepalReady = false;
let isSpeaking = false;
let recognition = null;
let isListening = false;
let currentMode = "echo";
let conversationHistory = [];
let pendingSpeak = null;
let currentCharacterIndex = 0;

const characters = [
  {
    name: "Character 1",
    sceneId: 2774772,
    hash: "L8PVdb3MQ9Kg1YElNguaEr3s5CH9AJC6",
    width: 380,
    height: 340,
    // Tom (US Male) — adjust voice/engine IDs to match your SitePal account
    voice: { id: 3, language: 1, engine: 3 },
    systemPrompt: "You are Alex, a friendly and laid-back male assistant. You speak casually and keep things simple. You enjoy cracking the occasional light joke. Never use emojis. Keep responses short and conversational.",
  },
  {
    name: "Character 2",
    sceneId: 2774778,
    hash: "fBZ3peH3vZSEUNKujwuceAq7AIDzzXuU",
    width: 380,
    height: 340,
    // Female voice — adjust voice/engine IDs to match your SitePal account
    voice: { id: 1, language: 1, engine: 2 },
    systemPrompt: "You are Sophia, a sharp and professional female assistant. You are articulate, precise, and thoughtful. You give well-structured answers but keep them concise. Never use emojis.",
  }
];

function setStatus(text, active) {
  statusText.textContent = text;
  statusText.classList.toggle("active", !!active);
}

function loadCharacter(index) {
  if (index === currentCharacterIndex && sitepalReady) return;

  currentCharacterIndex = index;
  sitepalReady = false;
  isSpeaking = false;
  pendingSpeak = null;

  document.querySelectorAll(".char-btn").forEach(function (btn, i) {
    btn.classList.toggle("active", i === index);
  });

  conversationHistory = [];

  const char = characters[index];
  const container = document.getElementById("sitepal-container");
  container.innerHTML = "";

  setStatus("Loading " + char.name + "…");

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.text = "AC_VHost_Embed(" +
    "8412077," + char.width + "," + char.height + ',"",1,1,' +
    char.sceneId + ',0,1,0,"' + char.hash + '",0,0);';
  container.appendChild(script);
}

function formatTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function addMessage(role, text) {
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap " + role;

  const div = document.createElement("div");
  div.className = "msg " + role;
  div.textContent = text;
  wrap.appendChild(div);

  if (role !== "system") {
    const ts = document.createElement("div");
    ts.className = "timestamp";
    ts.textContent = formatTime();
    wrap.appendChild(ts);
  }

  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function saveTranscript() {
  localStorage.setItem("sitepalEchoTranscript", messagesEl.innerHTML);
}

function restoreTranscript() {
  const saved = localStorage.getItem("sitepalEchoTranscript");

  if (saved) {
    messagesEl.innerHTML = saved;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } else {
    addMessage("system", "Ready. Type a message or use the mic.");
  }
}

function addAndSave(role, text) {
  addMessage(role, text);
  saveTranscript();
}

function speakWithSitePal(text) {
  if (!sitepalReady) return;

  // If already speaking, queue this and speak it when done
  if (isSpeaking) {
    pendingSpeak = text;
    return;
  }

  const speakFunction =
    typeof window.sayText === "function"
      ? window.sayText
      : typeof sayText === "function"
      ? sayText
      : null;

  if (!speakFunction) return;

  const { id, language, engine } = characters[currentCharacterIndex].voice;

  try {
    isSpeaking = true;
    setStatus("Speaking…", true);
    speakFunction(text, id, language, engine);
  } catch (error) {
    isSpeaking = false;
    setStatus("Avatar ready", true);
  }
}

// ── Mode switching ──
function setMode(mode) {
  currentMode = mode;
  if (mode === "echo") {
    echoModeBtn.classList.add("active");
    llmModeBtn.classList.remove("active");
    chatTitle.textContent = "Echo Chat";
    chatSub.textContent = "Avatar repeats what you say";
    conversationHistory = [];
  } else {
    llmModeBtn.classList.add("active");
    echoModeBtn.classList.remove("active");
    chatTitle.textContent = "LLM Chat";
    chatSub.textContent = "Powered by Claude";
    conversationHistory = [];
    addAndSave("system", "LLM mode on. Start chatting.");
  }
}

echoModeBtn.addEventListener("click", function () { setMode("echo"); });
llmModeBtn.addEventListener("click", function () { setMode("llm"); });

// ── Claude API call ──
async function callClaude(userMessage) {
  const apiKey = CLAUDE_API_KEY;

  conversationHistory.push({ role: "user", content: userMessage });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: characters[currentCharacterIndex].systemPrompt,
        messages: conversationHistory
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || "API error " + res.status);
    }

    const data = await res.json();
    const reply = data.content[0].text;
    conversationHistory.push({ role: "assistant", content: reply });
    return reply;
  } catch (error) {
    conversationHistory.pop();
    addAndSave("system", "Claude error: " + error.message);
    return null;
  }
}

// ── Send handler ──
async function handleSend() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  chatInput.focus();

  if (currentMode === "echo") {
    addAndSave("user", text);
    addAndSave("avatar", text);
    speakWithSitePal(text);
  } else {
    addAndSave("user", text);
    setStatus("Claude is thinking…");
    const reply = await callClaude(text);
    if (reply) {
      addAndSave("avatar", reply);
      speakWithSitePal(reply);
    } else {
      setStatus("Avatar ready", true);
    }
  }
}

sendBtn.addEventListener("click", handleSend);

chatInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    handleSend();
  }
});

clearBtn.addEventListener("click", function () {
  messagesEl.innerHTML = "";
  localStorage.removeItem("sitepalEchoTranscript");
  addMessage("system", "Transcript cleared.");
  saveTranscript();
});

stopBtn.addEventListener("click", function () {
  const stopFunction =
    typeof window.stopSpeech === "function"
      ? window.stopSpeech
      : typeof stopSpeech === "function"
      ? stopSpeech
      : null;

  if (stopFunction) {
    stopFunction();
    isSpeaking = false;
    setStatus("speech stopped");
  } else {
    addAndSave("system", "stopSpeech is not available in your current SitePal setup.");
  }
});

function setupSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || /** @type {any} */ (window).webkitSpeechRecognition;

  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.textContent = "No Mic";
    addAndSave("system", "Browser speech recognition is not available here.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = function () {
    isListening = true;
    micBtn.textContent = "Listening";
    setStatus("listening");
  };

  recognition.onend = function () {
    isListening = false;
    micBtn.textContent = "Mic";

    if (!isSpeaking) {
      setStatus("idle");
    }
  };

  recognition.onerror = function (event) {
    addAndSave("system", "Mic error: " + event.error);
    isListening = false;
    micBtn.textContent = "Mic";
    setStatus("mic error");
  };

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    chatInput.value = transcript;
    handleSend();
  };
}

micBtn.addEventListener("click", function () {
  if (!recognition) {
    addAndSave("system", "Speech recognition is not configured in this browser.");
    return;
  }

  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
});

window.vh_sceneLoaded = function () {
  sitepalReady = true;
  setStatus("Avatar ready", true);
  addAndSave("system", "Avatar loaded. Start talking!");
};

window.vh_talkStarted = function () {
  isSpeaking = true;
  setStatus("Speaking…", true);
};

window.vh_talkEnded = function () {
  isSpeaking = false;
  setStatus("Avatar ready", true);
  if (pendingSpeak) {
    const text = pendingSpeak;
    pendingSpeak = null;
    setTimeout(function () { speakWithSitePal(text); }, 100);
  }
};

window.vh_audioError = function () {
  isSpeaking = false;
  setStatus("Audio error");
  if (pendingSpeak) {
    pendingSpeak = null;
  }
};

document.querySelectorAll(".char-btn").forEach(function (btn, index) {
  btn.addEventListener("click", function () { loadCharacter(index); });
});

restoreTranscript();
setupSpeechRecognition();
loadCharacter(0);