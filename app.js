// ...existing code...
const els = {
  stage: document.getElementById('stage'),
  micBtn: document.getElementById('micBtn'),
  clearBtn: document.getElementById('clearBtn'),
  status: document.getElementById('status'),
  transcript: document.getElementById('transcript'),
  prompt: document.getElementById('prompt'),
  toast: document.getElementById('toast'),
};
// ...existing code...
let recognition;
let listening = false;
let interim = '';
let finalText = '';
let generating = false;
let lastGenAt = 0;
const MIN_INTERVAL_MS = 2000;

const hasMediaAccessAPI = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
async function ensureMicPermission() {
  if (!hasMediaAccessAPI) return true;
  try { await navigator.mediaDevices.getUserMedia({ audio: true }); return true; }
  catch (e) { showToast('Microphone permission denied.'); return false; }
}

function showStatus(text) { els.status.textContent = text; }
function showToast(text) {
  els.toast.textContent = text; els.toast.classList.add('show');
  clearTimeout(showToast._t); showToast._t = setTimeout(() => els.toast.classList.remove('show'), 1600);
}
// ...existing code...
function chooseAspectRatio() {
  const w = window.innerWidth, h = window.innerHeight;
  const ratio = w / h;
  if (ratio > 2.1) return "21:9";
  if (ratio > 1.7) return "16:9";
  if (ratio > 1.45) return "3:2";
  if (ratio > 1.2) return "4:3";
  if (ratio > 1.0) return "5:4";
  if (ratio > 0.8) return "4:5";
  return "9:16";
}
// ...existing code...
async function toImagePrompt(speech) {
  const system = `You are an expert prompt engineer for text-to-image models.
Respond only in JSON with this schema and nothing else:
{
  prompt: string;        // rich, visual, specific; avoid pronouns; no camera watermarks
  negative: string;      // optional negative guidance; can be empty
  style: string;         // brief style direction (e.g., "cinematic, soft light")
}`;
  try {
    const completion = await websim.chat.completions.create({
      messages: [
        { role: "system", content: system },
        { role: "user", content: [{ type: "text", text: speech }] },
      ],
      json: true,
    });
    const obj = JSON.parse(completion.content);
    return {
      prompt: [obj.prompt, obj.style].filter(Boolean).join(', '),
      negative: obj.negative || '',
    };
  } catch (e) {
    return { prompt: speech, negative: '' };
  }
}
// ...existing code...
async function generateFromSpeech(text) {
  if (!text || !text.trim()) return;
  const now = Date.now();
  if (generating || (now - lastGenAt) < MIN_INTERVAL_MS) return;
  generating = true; lastGenAt = now;

  showStatus('Generating image...');
  els.prompt.textContent = '';

  try {
    const { prompt, negative } = await toImagePrompt(text.trim());
    els.prompt.textContent = `Prompt: ${prompt}`;

    const ar = chooseAspectRatio();
    const result = await websim.imageGen({
      prompt,
      negative_prompt: negative,
      aspect_ratio: ar,
    });

    await swapBackground(result.url);
    showStatus(`Listening${listening ? '…' : ''}`);
  } catch (err) {
    console.error(err);
    showToast('Generation failed. Try again.');
    showStatus('Idle');
  } finally {
    generating = false;
  }
}
// ...existing code...
function swapBackground(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      els.stage.classList.add('fade-enter');
      requestAnimationFrame(() => {
        els.stage.style.backgroundImage = `url("${url}")`;
        els.stage.classList.add('fade-enter-active');
        setTimeout(() => {
          els.stage.classList.remove('fade-enter', 'fade-enter-active');
          resolve();
        }, 240);
      });
    };
    img.onerror = reject;
    img.src = url;
  });
}
// ...existing code...
function setupRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast('SpeechRecognition not supported in this browser.');
    els.micBtn.disabled = true;
    showStatus('Unavailable: use Chrome desktop or Android');
    return;
  }
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';

  recognition.onstart = () => {
    listening = true; showStatus('Listening…'); els.micBtn.textContent = 'Stop Listening';
  };
  recognition.onend = () => {
    listening = false; showStatus('Idle'); els.micBtn.textContent = 'Start Listening';
  };
  recognition.onerror = (e) => { console.warn('SR error', e.error); showToast(`Mic error: ${e.error}`); };

  recognition.onresult = (event) => {
    let interimStr = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        finalText = (finalText + ' ' + res[0].transcript).trim();
        els.transcript.textContent = finalText;
        // Trigger generation on each final segment
        generateFromSpeech(finalText);
        // reset final to avoid runaway length; keep last sentence or two
        finalText = finalText.split(/(?<=[.!?\n])\s+/).slice(-2).join(' ');
      } else {
        interimStr += res[0].transcript;
      }
    }
    interim = interimStr;
    if (interim) els.transcript.textContent = (finalText + ' ' + interim).trim();
  };
}
// ...existing code...
async function toggleMic() {
  if (!recognition) { setupRecognition(); }
  if (!recognition) return;
  if (listening) {
    recognition.stop();
  } else {
    try {
      finalText = ''; interim = '';
      els.transcript.textContent = '';
      if (!(await ensureMicPermission())) return;
      recognition.start();
    } catch (_) {
      // Safari might throw if already started
    }
  }
}

/* ...existing code... */
els.micBtn.addEventListener('click', () => { toggleMic(); });
/* ...existing code... */
els.clearBtn.addEventListener('click', () => {
  els.transcript.textContent = '';
  els.prompt.textContent = '';
  finalText = ''; interim = '';
  showToast('Cleared');
});
// ...existing code...
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); toggleMic(); }
});
// ...existing code...
setupRecognition();
showStatus('Idle — press Space or click Start Listening');