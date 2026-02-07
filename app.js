const recordBtn = document.getElementById('recordBtn');
const timerElement = document.getElementById('timer');
const canvas = document.getElementById('visualizer');
const canvasCtx = canvas.getContext('2d');
const controls = document.getElementById('controls');
const discardBtn = document.getElementById('discardBtn');
const shareBtn = document.getElementById('shareBtn');
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
shareBtn.addEventListener('click', () => {
    processAndShare(currentEffect);
});

async function processAndShare(effectType) {
    if (!originalAudioBlob) return;

    // Show loading text on button
    const originalBtnText = shareBtn.textContent;
    shareBtn.textContent = "Processing...";
    shareBtn.disabled = true;

    try {
        // Convert Blob to ArrayBuffer
        const arrayBuffer = await originalAudioBlob.arrayBuffer();

        // Decode Audio
        const offlineCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

        // If Normal, just share directly (or process 1:1)
        // Rate based Pitch Shift
        let playbackRate = 1.0;
        if (effectType === 'helium') playbackRate = 1.4;
        if (effectType === 'giant') playbackRate = 0.7;
        if (effectType === 'robot') playbackRate = 0.8;
        if (effectType === 'cave') playbackRate = 1.0;

        // Create Offline Context
        const userDuration = audioBuffer.duration / playbackRate;
        const length = Math.ceil(userDuration * audioBuffer.sampleRate); // MUST be integer

        const offlineRenderer = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            length,
            audioBuffer.sampleRate
        );

        const source = offlineRenderer.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = playbackRate;

        // Add Reverb for Cave
        let destination = offlineRenderer.destination;
        if (effectType === 'cave') {
            const convolver = offlineRenderer.createConvolver();
            // Create a simple impulse response for reverb
            const rate = audioBuffer.sampleRate;
            const length = rate * 2.5; // 2.5s reverb
            const decay = 2.0;
            const impulse = offlineRenderer.createBuffer(2, length, rate);
            const impulseL = impulse.getChannelData(0);
            const impulseR = impulse.getChannelData(1);
            for (let i = 0; i < length; i++) {
                const n = length - i;
                impulseL[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
                impulseR[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
            }
            convolver.buffer = impulse;
            source.connect(convolver);
            convolver.connect(destination);
        } else {
            source.connect(destination);
        }

        source.start();

        // Render
        const renderedBuffer = await offlineRenderer.startRendering();

        // Convert to WAV
        const finalBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
        const file = new File([finalBlob], `voice_${effectType}_${Date.now()}.wav`, { type: 'audio/wav' });

        // Share
        try {
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
            // Download fallback
            const url = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `voice_${effectType}.wav`;
            a.click();
            // Don't alert if user cancelled share, just log
            if (shareError.name !== 'AbortError') {
                alert("Sharing failed, file downloaded instead.");
            }
        }

    } catch (err) {
        console.error("Processing Error:", err);
        alert("Error details: " + err.message);
    } finally {
        shareBtn.textContent = originalBtnText;
        shareBtn.disabled = false;
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
