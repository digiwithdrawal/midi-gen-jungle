/* DRUM & GEN official V1 app.js
   Requires Tone.js + MidiWriterJS from index.html
*/

const bpmSlider = document.getElementById("bpmSlider");
const complexitySlider = document.getElementById("complexitySlider");
const ghostSlider = document.getElementById("ghostSlider");
const digiSlider = document.getElementById("digiSlider");
const bpmReadout = document.getElementById("bpmReadout");
const statusText = document.getElementById("statusText");
const sequencerGrid = document.getElementById("sequencerGrid");
const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");

const STEPS = 32;
let currentStep = 0;
let loop = null;
let audioReady = false;

const state = {
  bpm: 170,
  complexity: 72,
  ghost: 65,
  digi: 58,
  tracks: {
    drums: { muted: false, locked: false, volume: 0.95, pattern: [] },
    bass: { muted: false, locked: false, volume: 0.85, pattern: [] },
    pads: { muted: false, locked: false, volume: 0.65, pattern: [] },
    lead: { muted: false, locked: false, volume: 0.7, pattern: [] },
    fx: { muted: false, locked: false, volume: 0.55, pattern: [] }
  }
};

let drumSynths, bassSynth, padSynth, leadSynth, fxSynth;

function chance(percent) {
  return Math.random() * 100 < percent;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function setupSequencerGrid() {
  sequencerGrid.innerHTML = "";
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i < STEPS; i++) {
      const cell = document.createElement("div");
      cell.className = "seq-cell";
      sequencerGrid.appendChild(cell);
    }
  }
}

function paintSequencer() {
  const names = ["drums", "bass", "pads", "lead", "fx"];
  const cells = sequencerGrid.querySelectorAll(".seq-cell");

  cells.forEach((cell, index) => {
    const row = Math.floor(index / STEPS);
    const step = index % STEPS;
    const track = names[row];
    const active = !!state.tracks[track].pattern[step];

    cell.classList.toggle("active", active);
    cell.style.outline = step === currentStep ? "2px solid white" : "none";
  });
}

function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const bars = 64;
  const w = canvas.width / bars;
  const playing = audioReady && Tone.Transport.state === "started";

  for (let i = 0; i < bars; i++) {
    const level = playing ? Math.random() * 95 + 10 : Math.random() * 8;
    const h = level * (0.5 + Math.random() * 0.8);

    ctx.fillStyle = i % 3 === 0 ? "#39ff14" : i % 3 === 1 ? "#ff27d8" : "#ffffff";
    ctx.fillRect(i * w, canvas.height - h, w - 2, h);
  }
}

function setupAudio() {
  const master = new Tone.Volume(-7).toDestination();
  const reverb = new Tone.Reverb({ decay: 2.4, wet: 0.22 }).connect(master);
  const delay = new Tone.FeedbackDelay("8n", 0.25).connect(master);
  const crusher = new Tone.BitCrusher(6).connect(master);

  drumSynths = {
    kick: new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.23, sustain: 0.01, release: 0.15 }
    }).connect(master),

    snare: new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.11, sustain: 0 }
    }).connect(master),

    hat: new Tone.MetalSynth({
      frequency: 300,
      envelope: { attack: 0.001, decay: 0.045, release: 0.02 },
      harmonicity: 5.1,
      modulationIndex: 18,
      resonance: 3500,
      octaves: 1.5
    }).connect(master),

    ghost: new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0 }
    }).connect(master)
  };

  bassSynth = new Tone.MonoSynth({
    oscillator: { type: "sawtooth" },
    filter: { Q: 3, type: "lowpass", rolloff: -24 },
    envelope: { attack: 0.01, decay: 0.12, sustain: 0.45, release: 0.12 },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.12,
      sustain: 0.28,
      release: 0.08,
      baseFrequency: 60,
      octaves: 3
    }
  }).connect(crusher);

  padSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "fatsawtooth" },
    envelope: { attack: 0.35, decay: 0.5, sustain: 0.8, release: 1.6 }
  }).connect(reverb);

  leadSynth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.005, decay: 0.13, sustain: 0.22, release: 0.18 }
  }).connect(delay);

  fxSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.02, decay: 0.25, sustain: 0.1, release: 0.4 }
  }).connect(delay);
}

function generateDrums() {
  const p = new Array(STEPS).fill(null);

  for (let i = 0; i < STEPS; i++) {
    const e = [];

    if ([0, 8, 16, 24].includes(i)) e.push("kick");
    if ([4, 12, 20, 28].includes(i)) e.push("snare");
    if (i % 2 === 0 && chance(70 + state.complexity * 0.25)) e.push("hat");

    if ([6, 14, 22, 30].includes(i) && chance(state.complexity)) e.push("kick");
    if ([3, 7, 11, 15, 19, 23, 27, 31].includes(i) && chance(state.ghost)) e.push("ghost");
    if (chance(state.complexity * 0.09)) e.push(pick(["kick", "hat", "ghost"]));

    p[i] = e.length ? e : null;
  }

  return p;
}

function generateBass() {
  const notes = ["C2", "Eb2", "F2", "G2", "Bb1", "C3"];
  const p = new Array(STEPS).fill(null);

  for (let i = 0; i < STEPS; i++) {
    if (i % 4 === 0 || chance(state.complexity * 0.18)) {
      p[i] = pick(notes);
    }
  }

  return p;
}

function generatePads() {
  const chords = [
    ["C4", "Eb4", "G4", "Bb4"],
    ["Ab3", "C4", "Eb4", "G4"],
    ["F3", "Ab3", "C4", "Eb4"],
    ["Bb3", "D4", "F4", "Ab4"]
  ];

  const p = new Array(STEPS).fill(null);
  p[0] = pick(chords);
  p[16] = pick(chords);
  return p;
}

function generateLead() {
  const notes = ["C5", "D5", "Eb5", "F5", "G5", "Bb5", "C6"];
  const p = new Array(STEPS).fill(null);

  for (let i = 0; i < STEPS; i++) {
    if (i % 2 === 1 && chance(state.digi * 0.22)) p[i] = pick(notes);
  }

  return p;
}

function generateFX() {
  const p = new Array(STEPS).fill(null);
  [0, 15, 16, 31].forEach(step => {
    if (chance(70)) p[step] = pick(["C6", "G6", "Bb5"]);
  });
  return p;
}

function generatePatterns() {
  for (const track of Object.keys(state.tracks)) {
    if (state.tracks[track].locked) continue;

    if (track === "drums") state.tracks[track].pattern = generateDrums();
    if (track === "bass") state.tracks[track].pattern = generateBass();
    if (track === "pads") state.tracks[track].pattern = generatePads();
    if (track === "lead") state.tracks[track].pattern = generateLead();
    if (track === "fx") state.tracks[track].pattern = generateFX();
  }

  paintSequencer();
  updateTrackDots();
  statusText.textContent = "NEW JUNGLE MIDI GENERATED";
}

function playStep(time) {
  const tracks = state.tracks;

  if (!tracks.drums.muted) {
    const events = tracks.drums.pattern[currentStep];
    if (events) {
      events.forEach(event => {
        if (event === "kick") drumSynths.kick.triggerAttackRelease("C1", "16n", time, tracks.drums.volume);
        if (event === "snare") drumSynths.snare.triggerAttackRelease("16n", time, tracks.drums.volume * 0.75);
        if (event === "hat") drumSynths.hat.triggerAttackRelease("C5", "32n", time, tracks.drums.volume * 0.35);
        if (event === "ghost") drumSynths.ghost.triggerAttackRelease("32n", time, tracks.drums.volume * 0.22);
      });
    }
  }

  if (!tracks.bass.muted && tracks.bass.pattern[currentStep]) {
    bassSynth.triggerAttackRelease(tracks.bass.pattern[currentStep], "8n", time, tracks.bass.volume);
  }

  if (!tracks.pads.muted && tracks.pads.pattern[currentStep]) {
    padSynth.triggerAttackRelease(tracks.pads.pattern[currentStep], "2n", time, tracks.pads.volume * 0.45);
  }

  if (!tracks.lead.muted && tracks.lead.pattern[currentStep]) {
    leadSynth.triggerAttackRelease(tracks.lead.pattern[currentStep], "16n", time, tracks.lead.volume * 0.55);
  }

  if (!tracks.fx.muted && tracks.fx.pattern[currentStep]) {
    fxSynth.triggerAttackRelease(tracks.fx.pattern[currentStep], "16n", time, tracks.fx.volume * 0.35);
  }

  paintSequencer();
  currentStep = (currentStep + 1) % STEPS;
}

async function play() {
  if (!audioReady) {
    await Tone.start();
    setupAudio();
    audioReady = true;
  }

  if (!state.tracks.drums.pattern.length) generatePatterns();

  Tone.Transport.bpm.value = state.bpm;

  if (!loop) {
    loop = new Tone.Loop(playStep, "16n");
    loop.start(0);
  }

  Tone.Transport.start();
  statusText.textContent = "PLAYING";
}

function pause() {
  Tone.Transport.pause();
  statusText.textContent = "PAUSED";
}

function stop() {
  Tone.Transport.stop();
  currentStep = 0;
  paintSequencer();
  statusText.textContent = "STOPPED";
}

function updateTrackDots() {
  document.querySelectorAll(".track-row").forEach(row => {
    const track = row.dataset.track;
    const dots = row.querySelector(".track-dots");
    const activeCount = state.tracks[track].pattern.filter(Boolean).length;
    dots.style.opacity = state.tracks[track].muted ? "0.2" : "0.8";
    dots.style.backgroundSize = `${Math.max(8, 90 / Math.max(1, activeCount))}px 10px`;
  });
}

function addMidiNote(track, pitch, startTick, duration, velocity = 80) {
  track.addEvent(new MidiWriter.NoteEvent({
    pitch: Array.isArray(pitch) ? pitch : [pitch],
    duration: "T" + duration,
    startTick,
    velocity
  }));
}

function downloadMidi() {
  if (!state.tracks.drums.pattern.length) generatePatterns();

  const tracks = [];
  const ticksPerStep = 120;

  const drumMap = { kick: "C2", snare: "D2", hat: "F#2", ghost: "D#2" };

  for (const [name, data] of Object.entries(state.tracks)) {
    if (data.muted) continue;

    const midiTrack = new MidiWriter.Track();
    midiTrack.setTempo(state.bpm);
    midiTrack.addTrackName(name.toUpperCase());

    data.pattern.forEach((event, step) => {
      if (!event) return;

      const startTick = step * ticksPerStep;

      if (name === "drums") {
        event.forEach(drum => {
          addMidiNote(midiTrack, drumMap[drum], startTick, 60, 90);
        });
      } else if (name === "pads") {
        addMidiNote(midiTrack, event, startTick, ticksPerStep * 8, 65);
      } else {
        addMidiNote(midiTrack, event, startTick, ticksPerStep * 2, 80);
      }
    });

    tracks.push(midiTrack);
  }

  if (!tracks.length) {
    statusText.textContent = "UNMUTE AT LEAST ONE TRACK TO DOWNLOAD";
    return;
  }

  const writer = new MidiWriter.Writer(tracks);
  const blob = new Blob([writer.buildFile()], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `drum-and-gen-${state.bpm}bpm.mid`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  statusText.textContent = "MIDI DOWNLOADED";
}

function hookControls() {
  bpmSlider.addEventListener("input", () => {
    state.bpm = Number(bpmSlider.value);
    bpmReadout.textContent = `${state.bpm} BPM`;
    if (audioReady) Tone.Transport.bpm.value = state.bpm;
  });

  complexitySlider.addEventListener("input", () => {
    state.complexity = Number(complexitySlider.value);
  });

  ghostSlider.addEventListener("input", () => {
    state.ghost = Number(ghostSlider.value);
  });

  digiSlider.addEventListener("input", () => {
    state.digi = Number(digiSlider.value);
  });

  document.getElementById("playBtn").addEventListener("click", play);
  document.getElementById("pauseBtn").addEventListener("click", pause);
  document.getElementById("stopBtn").addEventListener("click", stop);
  document.getElementById("generateBtn").addEventListener("click", generatePatterns);

  document.getElementById("randomBtn").addEventListener("click", () => {
    state.bpm = Math.floor(rand(154, 179));
    state.complexity = Math.floor(rand(45, 100));
    state.ghost = Math.floor(rand(30, 100));
    state.digi = Math.floor(rand(20, 100));

    bpmSlider.value = state.bpm;
    complexitySlider.value = state.complexity;
    ghostSlider.value = state.ghost;
    digiSlider.value = state.digi;
    bpmReadout.textContent = `${state.bpm} BPM`;

    if (audioReady) Tone.Transport.bpm.value = state.bpm;

    generatePatterns();
  });

  document.getElementById("exportBtn").addEventListener("click", downloadMidi);

  document.querySelectorAll(".track-row").forEach(row => {
    const track = row.dataset.track;
    const muteBtn = row.querySelector(".mute-btn");
    const lockBtn = row.querySelector(".lock-btn");
    const vol = row.querySelector(".vol");

    muteBtn.addEventListener("click", () => {
      state.tracks[track].muted = !state.tracks[track].muted;
      muteBtn.classList.toggle("muted", state.tracks[track].muted);
      updateTrackDots();
    });

    lockBtn.addEventListener("click", () => {
      state.tracks[track].locked = !state.tracks[track].locked;
      lockBtn.classList.toggle("locked", state.tracks[track].locked);
    });

    vol.addEventListener("input", () => {
      state.tracks[track].volume = Number(vol.value);
    });
  });
}

setupSequencerGrid();
hookControls();
generatePatterns();
drawVisualizer();
