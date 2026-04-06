const CLAUDE_API_KEY = import.meta.env.VITE_CLAUDE_KEY;
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_KEY;

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
const dgModeBtn = document.getElementById("dgModeBtn");
const webModeBtn = document.getElementById("webModeBtn");

let sitepalReady = false;
let isSpeaking = false;
let isListening = false;
let dgSocket = null;
let mediaStream = null;
let mediaRecorder = null;
let webRecognition = null;
let micMode = "deepgram";
let currentMode = "echo";
let conversationHistory = [];
let pendingSpeak = null;
let currentCharacterIndex = 0;

const characters = [
  {
    name: "Frederick McKinley Jones",
    sceneId: 2774772,
    hash: "L8PVdb3MQ9Kg1YElNguaEr3s5CH9AJC6",
    width: 380,
    height: 340,
    // Tom (US Male) — adjust voice/engine IDs to match your SitePal account
    voice: { id: 3, language: 1, engine: 3 },
    systemPrompt: "You are Frederick McKinley Jones, the pioneering African American inventor and engineer born in 1893. You are best known for inventing the first practical automatic refrigeration system for long-haul trucks, which revolutionized the food and transport industries and led to the founding of Thermo King. You are largely self-taught, having grown up without formal schooling, and you developed expertise in mechanics, electronics, and film sound equipment through relentless curiosity and hands-on work. You served in World War I and later became the first Black member elected to the American Society of Refrigeration Engineers. You hold over 60 patents. Speak in a grounded, humble, and thoughtful manner. You are proud of your work but never boastful. You draw on your life experiences and inventions when answering questions. Never use emojis. Keep responses conversational and concise.",
  },
  {
    name: "Van Brittan Brown",
    sceneId: 2774778,
    hash: "fBZ3peH3vZSEUNKujwuceAq7AIDzzXuU",
    width: 380,
    height: 340,
    // Female voice — adjust voice/engine IDs to match your SitePal account
    voice: { id: 1, language: 1, engine: 2 },
    systemPrompt: "You are Marie Van Brittan Brown, the African American inventor born in 1922 who created the first home security system in 1966. Working as a nurse in Queens, New York, you often came home late at night and were concerned about safety in your neighborhood. Together with your husband Albert Brown, you invented a closed-circuit television security system that used cameras, monitors, and remote-controlled door locks — the foundation of every modern home security and surveillance system in use today. Your patent was granted in 1969. You are resourceful, observant, and driven by a deep concern for community safety and the well-being of everyday people. Speak with warmth, confidence, and practicality. You connect your inventions to real human needs. Never use emojis. Keep responses conversational and concise.",
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

async function startDeepgram() {
  if (!DEEPGRAM_API_KEY || DEEPGRAM_API_KEY === "paste-your-deepgram-key-here") {
    addAndSave("system", "Add your Deepgram API key to .env as VITE_DEEPGRAM_KEY.");
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    addAndSave("system", "Mic access denied: " + err.message);
    return;
  }

  const url = "wss://api.deepgram.com/v1/listen?language=en&punctuate=true&interim_results=false";
  dgSocket = new WebSocket(url, ["token", DEEPGRAM_API_KEY]);

  dgSocket.onopen = function () {
    console.log("[Deepgram] WebSocket connected");
    isListening = true;
    micBtn.textContent = "Listening";
    setStatus("Listening", true);

    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: "audio/webm" });
    mediaRecorder.ondataavailable = function (e) {
      if (e.data.size > 0 && dgSocket && dgSocket.readyState === WebSocket.OPEN) {
        dgSocket.send(e.data);
      }
    };
    mediaRecorder.start(250);
  };

  dgSocket.onmessage = function (event) {
    const data = JSON.parse(event.data);
    const transcript = data?.channel?.alternatives?.[0]?.transcript;
    if (transcript) console.log("[Deepgram] transcript:", transcript);
    if (transcript && transcript.trim()) {
      chatInput.value = transcript.trim();
      stopDeepgram();
      handleSend();
    }
  };

  dgSocket.onerror = function () {
    addAndSave("system", "Deepgram connection error.");
    stopDeepgram();
  };

  dgSocket.onclose = function () {
    isListening = false;
    micBtn.textContent = "Mic";
    if (!isSpeaking) setStatus("Avatar ready", true);
  };
}

function stopDeepgram() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") { mediaRecorder.stop(); mediaRecorder = null; }
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  if (dgSocket && dgSocket.readyState === WebSocket.OPEN) dgSocket.close();
  isListening = false;
  micBtn.textContent = "Mic";
}

function setupWebSpeech() {
  const SR = /** @type {any} */ (window).SpeechRecognition || /** @type {any} */ (window).webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = "en-US";
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onstart = function () { isListening = true; micBtn.textContent = "Listening"; setStatus("Listening", true); };
  r.onend = function () { isListening = false; micBtn.textContent = "Mic"; if (!isSpeaking) setStatus("Avatar ready", true); };
  r.onerror = function (e) { addAndSave("system", "Mic error: " + e.error); isListening = false; micBtn.textContent = "Mic"; };
  r.onresult = function (e) { chatInput.value = e.results[0][0].transcript; handleSend(); };
  return r;
}

webRecognition = setupWebSpeech();

dgModeBtn.addEventListener("click", function () {
  micMode = "deepgram";
  dgModeBtn.classList.add("active");
  webModeBtn.classList.remove("active");
});

webModeBtn.addEventListener("click", function () {
  micMode = "web";
  webModeBtn.classList.add("active");
  dgModeBtn.classList.remove("active");
});

micBtn.addEventListener("click", function () {
  if (micMode === "deepgram") {
    if (isListening) { stopDeepgram(); } else { startDeepgram(); }
  } else {
    if (!webRecognition) { addAndSave("system", "Web Speech not supported in this browser."); return; }
    if (isListening) { webRecognition.stop(); } else { webRecognition.start(); }
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
loadCharacter(0);
