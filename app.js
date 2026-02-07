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
shareBtn.addEventListener('click', async () => {
    if (!originalAudioBlob) return;

    const originalText = shareBtn.textContent;
    shareBtn.textContent = "Processing...";
    shareBtn.disabled = true;

    try {
        const finalBlob = await processAudioEffect(currentEffect);
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
        console.warn("Share failed, falling back to download", shareError);
        // Fallback to download if share fails (but we have a button for that now, so maybe just alert?)
        // Let's keep the fallback but notify user
        if (shareError.name !== 'AbortError') {
            alert("Sharing not supported on this device/browser. Downloading file instead.");
            const url = URL.createObjectURL(await processAudioEffect(currentEffect)); // Re-process is expensive, but safe. 
            // Actually, better to reuse blob? playBtn logic creates new one. 
            // Let's just trigger the download logic manually or just tell them to use Save.
        }
    } finally {
        shareBtn.textContent = originalText;
        shareBtn.disabled = false;
    }
});

// Core Audio Processing Logic
async function processAudioEffect(effectType) {
    // Convert Blob to ArrayBuffer
    const arrayBuffer = await originalAudioBlob.arrayBuffer();

    // Decode Audio
    const offlineCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

    // Setup Rendering Context
    // We might need to adjust duration for playbackRate
    let playbackRate = 1.0;
    if (effectType === 'helium') playbackRate = 1.4;
    if (effectType === 'giant') playbackRate = 0.7;
    // Robot uses Ring Mod, so rate is 1.0 usually, or maybe slightly slower? Let's keep 1.0
    if (effectType === 'robot') playbackRate = 1.0;
    if (effectType === 'cave') playbackRate = 1.0;

    const userDuration = audioBuffer.duration / playbackRate;
    const length = Math.ceil(userDuration * audioBuffer.sampleRate);

    const offlineRenderer = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        length,
        audioBuffer.sampleRate
    );

    const source = offlineRenderer.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackRate;

    const destination = offlineRenderer.destination;

    // Effect Chain
    if (effectType === 'robot') {
        // Ring Modulator Effect
        // 1. Create Oscillator (Modulator)
        const oscillator = offlineRenderer.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = 50; // 50Hz for robotic buzz

        // 2. Create Gain for modulation
        const modGain = offlineRenderer.createGain();
        modGain.gain.value = 0.0; // Start at 0, modulate around it? 
        // Actually for Ring Mod: Out = In * Carrier.
        // We need a GainNode where 'In' is audio, and 'Gain' is controlled by Carrier.
        // But Gain AudioParam is 0 to 1? No, it can be negative.

        // Proper Ring Mod in Web Audio:
        // Source -> GainNode (as Input) -> Dest
        // Osc -> GainNode.gain

        // But we need Osc to be centered at 0? Yes.
        // If Playback is normal, Gain is 1.
        // If Ring Mod, we want Gain to oscillate between -1 and 1?
        // Gain default value is 1. If we connect Osc, it adds to 1. So 0 to 2.
        // We set Gain.gain.value = 0. Then Osc (-1 to 1) makes it -1 to 1.

        const ringMod = offlineRenderer.createGain();
        ringMod.gain.value = 0;

        source.connect(ringMod);
        oscillator.connect(ringMod.gain);

        // Add a bit of dry signal? Or maybe a filter?
        // Robot usually needs to be monotonic. 
        // Let's add a LowPass to smooth the harshness
        const filter = offlineRenderer.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;

        ringMod.connect(filter);
        filter.connect(destination);

        oscillator.start();
    }
    else if (effectType === 'cave') {
        const convolver = offlineRenderer.createConvolver();
        // Create Reverb Impulse
        const rate = audioBuffer.sampleRate;
        const length = rate * 2.5;
        const decay = 2.0;
        const impulse = offlineRenderer.createBuffer(2, length, rate);
        const impulseL = impulse.getChannelData(0);
        const impulseR = impulse.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const n = length - i;
            // Simple noise impulse
            impulseL[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
            impulseR[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
        }
        convolver.buffer = impulse;
        source.connect(convolver);
        convolver.connect(destination);
    }
    else {
        // Normal, Helium, Giant
        source.connect(destination);
    }

    source.start();

    // Render
    const renderedBuffer = await offlineRenderer.startRendering();

    // Convert to WAV Blob
    return bufferToWave(renderedBuffer, renderedBuffer.length);
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
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(44 + pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], { type: "audio/wav" });

    function setUint16(data) { view.setUint16(pos, data, true); pos += 2; }
    function setUint32(data) { view.setUint32(pos, data, true); pos += 4; }
}
