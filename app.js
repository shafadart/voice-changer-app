const recordBtn = document.getElementById('recordBtn');
const timerElement = document.getElementById('timer');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
const controls = document.getElementById('controls');
const discardBtn = document.getElementById('discardBtn');
const shareBtn = document.getElementById('shareBtn');
const playBtn = document.getElementById('playBtn');
const downloadBtn = document.getElementById('downloadBtn');
const voiceBtns = document.querySelectorAll('.voice-btn');

let mediaRecorder;
let audioChunks = [];
let startTime;
let timerInterval;
let audioContext;
let analyser;
let dataArray;
let source;
let stream;
let originalAudioBlob;
let currentEffect = 'normal'; // Default effect

// Initialize Visualizer
function resizeCanvas() {
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = 100;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Helper: Format Time
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

// 0. Voice Selection Logic
voiceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all
        voiceBtns.forEach(b => b.classList.remove('active'));
        // Add to clicked
        btn.classList.add('active');
        // Update state
        currentEffect = btn.getAttribute('data-effect');
        console.log("Selected Voice:", currentEffect);
    });
});

// 1. Start Recording
recordBtn.addEventListener('click', async () => {
    if (recordBtn.classList.contains('recording')) {
        stopRecording();
    } else {
        startRecording();
    }
});

async function startRecording() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Setup Visualizer
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        drawVisualizer();

        // Setup Recorder
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            originalAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            stream.getTracks().forEach(track => track.stop()); // Stop mic
            cancelAnimationFrame(drawVisualizerId); // Stop visualizer
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas
        };

        mediaRecorder.start();

        // UI Updates
        recordBtn.classList.add('recording');
        timerElement.classList.add('visible');
        controls.classList.add('hidden');

        startTime = Date.now();
        timerInterval = setInterval(() => {
            const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
            timerElement.textContent = formatTime(elapsedTime);
        }, 1000);

    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Microphone access denied. Please allow permission.");
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        clearInterval(timerInterval);

        recordBtn.classList.remove('recording');
        controls.classList.remove('hidden');
    }
}

// Visualizer Loop
let drawVisualizerId;
function drawVisualizer() {
    drawVisualizerId = requestAnimationFrame(drawVisualizer);
    analyser.getByteFrequencyData(dataArray);

    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0)';
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / dataArray.length) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
        barHeight = dataArray[i] / 2;

        const gradient = canvasCtx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#0A84FF');
        gradient.addColorStop(1, '#00C6FF');

        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(x, canvas.height - barHeight - (canvas.height / 2 - 20), barWidth, barHeight);

        x += barWidth + 1;
    }
}

// 2. Discard
discardBtn.addEventListener('click', () => {
    audioChunks = [];
    originalAudioBlob = null;
    timerElement.textContent = "00:00";
    timerElement.classList.remove('visible');
    controls.classList.add('hidden');
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
});

// 3. Share (Process then Share)
// 3. Play Preview
playBtn.addEventListener('click', async () => {
    if (!originalAudioBlob) return;

    const originalText = playBtn.innerHTML;
    playBtn.innerHTML = '<span class="icon">⏳</span> ...';
    playBtn.disabled = true;

    try {
        const blob = await processAudioEffect(currentEffect);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        playBtn.innerHTML = '<span class="icon">🔊</span> Playing';
        audio.play();

        audio.onended = () => {
            playBtn.innerHTML = originalText;
            playBtn.disabled = false;
            URL.revokeObjectURL(url);
        };
    } catch (err) {
        console.error("Preview Error:", err);
        alert("Could not play preview.");
        playBtn.innerHTML = originalText;
        playBtn.disabled = false;
    }
});

// 4. Download
downloadBtn.addEventListener('click', async () => {
    if (!originalAudioBlob) return;

    const originalText = downloadBtn.innerHTML;
    downloadBtn.innerHTML = '<span class="icon">⏳</span>'; // Spinner?
    downloadBtn.disabled = true;

    try {
        const blob = await processAudioEffect(currentEffect);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `voice_${currentEffect}_${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Download Error", err);
    } finally {
        downloadBtn.innerHTML = originalText;
        downloadBtn.disabled = false;
    }
});

// 5. Share
// 5. Share
shareBtn.addEventListener('click', async () => {
    if (!originalAudioBlob) return;

    const originalText = shareBtn.textContent;
    shareBtn.textContent = "Processing...";
    shareBtn.disabled = true;

    let finalBlob;

    // Step 1: Process Audio
    try {
        finalBlob = await processAudioEffect(currentEffect);
    } catch (processErr) {
        console.error("Processing Failed:", processErr);
        alert("Could not process audio: " + processErr.message);
        shareBtn.textContent = originalText;
        shareBtn.disabled = false;
        return; // Stop if processing fails
    }

    // Step 2: Share
    try {
        const file = new File([finalBlob], `voice_${currentEffect}_${Date.now()}.wav`, { type: 'audio/wav' });

        if (navigator.share) {
            await navigator.share({
                files: [file],
                title: 'Funny Voice Message',
                text: 'Listen to my funny voice!'
            });
        } else {
            throw new Error("Sharing not supported");
        }
    } catch (shareError) {
        console.warn("Share failed:", shareError);

        // If it's not a user cancellation, offer download
        if (shareError.name !== 'AbortError') {
            const shouldDownload = confirm("Sharing is not supported or failed. Download the file instead?");
            if (shouldDownload) {
                const url = URL.createObjectURL(finalBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `voice_${currentEffect}.wav`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }
    } finally {
        shareBtn.textContent = originalText;
        shareBtn.disabled = false;
    }
});

// Core Audio Processing Logic
// Core Audio Processing Logic
async function processAudioEffect(effectType) {
    let offlineRenderer;
    try {
        // 1. Convert Blob to ArrayBuffer
        const arrayBuffer = await originalAudioBlob.arrayBuffer();

        // 2. Decode Audio
        // Use a new AudioContext for decoding to avoid issues with closed contexts
        const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);

        // 3. Configure Offline Renderer
        let playbackRate = 1.0;
        if (effectType === 'helium') playbackRate = 1.4;
        if (effectType === 'child') playbackRate = 1.6; // High pitch
        if (effectType === 'women') playbackRate = 1.25; // Slightly high
        if (effectType === 'giant') playbackRate = 0.7;
        if (effectType === 'gorilla') playbackRate = 0.65; // Very deep
        if (effectType === 'robot') playbackRate = 1.0;
        if (effectType === 'cave') playbackRate = 1.0;
        if (effectType === 'musician') playbackRate = 1.0;
        if (effectType === 'echo') playbackRate = 1.0;

        // Calculate duration and length
        // FIX: Force 44100Hz output to prevent "fast speech" issues on mobile (48k/96k mismatches)
        const TARGET_SAMPLE_RATE = 44100;

        const originalDuration = audioBuffer.duration;
        const processedDuration = originalDuration / playbackRate;

        // Add extra time for reverb/echo tail if needed
        let tailSeconds = 0.5;
        if (effectType === 'cave') tailSeconds = 2.0;
        if (effectType === 'musician') tailSeconds = 1.5;
        if (effectType === 'echo') tailSeconds = 2.0;

        const totalDuration = processedDuration + tailSeconds;

        const length = Math.ceil(totalDuration * TARGET_SAMPLE_RATE);

        offlineRenderer = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            audioBuffer.numberOfChannels,
            length,
            TARGET_SAMPLE_RATE
        );

        // 4. Create Source
        const source = offlineRenderer.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = playbackRate;

        // 5. Connect Effect Chain
        const destination = offlineRenderer.destination;

        if (effectType === 'robot') {
            // Ring Modulator
            const oscillator = offlineRenderer.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.value = 50;

            const ringMod = offlineRenderer.createGain();
            ringMod.gain.value = 0;

            // Robot: Source -> RingMod (Modulated by Osc) -> LowPass -> Dest
            source.connect(ringMod);
            oscillator.connect(ringMod.gain);

            const filter = offlineRenderer.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 2000;

            ringMod.connect(filter);
            filter.connect(destination);

            oscillator.start();
        }
        else if (effectType === 'cave' || effectType === 'musician') {
            // Reverb (Convolver)
            const convolver = offlineRenderer.createConvolver();
            const rate = TARGET_SAMPLE_RATE;

            // Adjust decay based on effect
            const decay = (effectType === 'cave') ? 2.5 : 1.0; // Musician has shorter reverb
            const impulseLen = rate * decay;
            const impulse = offlineRenderer.createBuffer(2, impulseLen, rate);
            const impulseL = impulse.getChannelData(0);
            const impulseR = impulse.getChannelData(1);

            for (let i = 0; i < impulseLen; i++) {
                const n = impulseLen - i;
                const vol = Math.pow(n / impulseLen, 2.0); // Simple linear-ish decay
                impulseL[i] = (Math.random() * 2 - 1) * vol;
                impulseR[i] = (Math.random() * 2 - 1) * vol;
            }
            convolver.buffer = impulse;

            // Dry/Wet Mix
            const dryGain = offlineRenderer.createGain();
            const wetGain = offlineRenderer.createGain();

            if (effectType === 'cave') {
                dryGain.gain.value = 0.3; // Mostly wet
                wetGain.gain.value = 0.9;
            } else { // musician
                dryGain.gain.value = 0.8; // Mostly dry (clarity)
                wetGain.gain.value = 0.4; // Subtle reverb
            }

            source.connect(dryGain);
            dryGain.connect(destination);

            source.connect(convolver);
            convolver.connect(wetGain);
            wetGain.connect(destination);
        }
        else if (effectType === 'echo') {
            // Delay + Feedback
            const delayTime = 0.3; // 300ms

            const delayNode = offlineRenderer.createDelay();
            delayNode.delayTime.value = delayTime;

            const feedbackGain = offlineRenderer.createGain();
            feedbackGain.gain.value = 0.4; // 40% feedback

            // Source -> Dest (Direct)
            source.connect(destination);

            // Source -> Delay -> Dest
            //      ^      |
            //      |______| (Feedback)

            source.connect(delayNode);
            delayNode.connect(destination);

            delayNode.connect(feedbackGain);
            feedbackGain.connect(delayNode);
        }
        else {
            // Simple Pitch Shift (Child, Women, Gorilla, Helium, Giant, Normal)
            source.connect(destination);
        }

        source.start();

        // 6. Provide output
        const renderedBuffer = await offlineRenderer.startRendering();
        return bufferToWave(renderedBuffer, renderedBuffer.length);

    } catch (err) {
        console.error("Audio Processing Failed at step:", err);
        throw new Error(`Processing failed: ${err.message || err}`);
    }
}

// Utility: Wav Converter
function bufferToWave(abuffer, len) {
    let numOfChan = abuffer.numberOfChannels,
        length = len * numOfChan * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = [], i, sample,
        offset = 0,
        pos = 0;

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);

    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);

    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (i = 0; i < abuffer.numberOfChannels; i++)
        channels.push(abuffer.getChannelData(i));

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            // Check if offset exists to avoid "Offset is outside the bounds" error
            // if resampling causes slight length mismatch
            let val = 0;
            if (offset < channels[i].length) {
                val = channels[i][offset];
            }

            sample = Math.max(-1, Math.min(1, val));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}

/* =========================================
   NOTE: One-Time Password Logic
   Password: "DARTmob5499"
   ========================================= */
(function initAuth() {
    const loginModal = document.getElementById('loginModal');
    const loginBtn = document.getElementById('loginBtn');
    const passwordInput = document.getElementById('passwordInput');
    const loginError = document.getElementById('loginError');
    const mainCard = document.getElementById('mainCard'); // Main app container

    const CORRECT_PASS = "DARTmob5499";
    const AUTH_KEY = "SR_Dart_Access";

    // 1. Check if already authenticated
    const isAuth = localStorage.getItem(AUTH_KEY);

    if (isAuth === 'granted') {
        loginModal.classList.add('hidden');
        // Optional: remove from DOM after transition
        setTimeout(() => loginModal.style.display = 'none', 600);
    } else {
        // Not authenticated
        loginModal.classList.remove('hidden');
    }

    // 2. Login Function
    function attemptLogin() {
        const inputVal = passwordInput.value.trim();

        if (inputVal === CORRECT_PASS) {
            // Success
            localStorage.setItem(AUTH_KEY, 'granted');
            loginModal.classList.add('hidden');
            setTimeout(() => loginModal.style.display = 'none', 600);
            passwordInput.blur(); // Hide keyboard on mobile
        } else {
            // Fail
            loginError.textContent = "Incorrect password";
            passwordInput.value = "";

            // Shake animation
            const card = document.querySelector('.login-card');
            card.classList.remove('shake');
            void card.offsetWidth; // trigger reflow
            card.classList.add('shake');
        }
    }

    // 3. Event Listeners
    loginBtn.addEventListener('click', attemptLogin);

    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            attemptLogin();
        }
    });
})();
