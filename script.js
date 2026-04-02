const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const micBtn = document.getElementById("micBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const statusText = document.getElementById("statusText");
const echoModeBtn = document.getElementById("echoModeBtn");
const llmModeBtn = document.getElementById("llmModeBtn");
const apikeyBar = document.getElementById("apikeyBar");
const apiKeyInput = document.getElementById("apiKeyInput");
const chatTitle = document.getElementById("chatTitle");
const chatSub = document.getElementById("chatSub");

let sitepalReady = false;
let isSpeaking = false;
let recognition = null;
let isListening = false;
let currentMode = "echo";
let conversationHistory = [];
let pendingSpeak = null;

const sitepalVoiceSettings = {
  voice: 3,
  language: 1,
  engine: 3
};

// Voice: Tom (US) — Voice ID: 3, Language ID: 1, Engine ID: 3

function setStatus(text, active) {
  statusText.textContent = text;
  statusText.classList.toggle("active", !!active);
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

  try {
    isSpeaking = true;
    setStatus("Speaking…", true);
    speakFunction(
      text,
      sitepalVoiceSettings.voice,
      sitepalVoiceSettings.language,
      sitepalVoiceSettings.engine
    );
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
    apikeyBar.classList.remove("visible");
    chatTitle.textContent = "Echo Chat";
    chatSub.textContent = "Avatar repeats what you say";
    conversationHistory = [];
  } else {
    llmModeBtn.classList.add("active");
    echoModeBtn.classList.remove("active");
    apikeyBar.classList.add("visible");
    chatTitle.textContent = "LLM Chat";
    chatSub.textContent = "Powered by Claude";
    conversationHistory = [];
    addAndSave("system", "LLM mode on. Enter your Claude API key above, then start chatting.");
  }
}

echoModeBtn.addEventListener("click", function () { setMode("echo"); });
llmModeBtn.addEventListener("click", function () { setMode("llm"); });

// ── Claude API call ──
async function callClaude(userMessage) {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    addAndSave("system", "Enter your Claude API key in the bar above.");
    return null;
  }

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
        system: "You are a helpful AI assistant speaking through an avatar. Keep responses concise and conversational.",
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
    addAndSave("user", "You: " + text);
    addAndSave("avatar", "Avatar: " + text);
    speakWithSitePal(text);
  } else {
    addAndSave("user", "You: " + text);
    setStatus("Claude is thinking…");
    const reply = await callClaude(text);
    if (reply) {
      addAndSave("avatar", "Claude: " + reply);
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

restoreTranscript();
setupSpeechRecognition();