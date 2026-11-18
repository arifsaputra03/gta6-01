// All sound is synthesized with WebAudio: no audio files, no network. A tiny
// step-sequenced music loop (bass + hats + lead stabs) and one-shot effects
// built from oscillators and filtered noise. Audio starts on the first user
// gesture, as browsers require; every call is safe before that (muted).

// A minor-key street groove at 112 bpm, one bar of 16 steps, notes as MIDI.
const MUSIC = {
  bpm: 112,
  bass: [45, 0, 45, 0, 48, 0, 45, 0, 43, 0, 43, 0, 50, 0, 48, 0],
  lead: [0, 0, 69, 0, 0, 72, 0, 0, 0, 0, 71, 0, 0, 67, 0, 0],
};

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createAudio() {
  let ac = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let muted = false;
  let musicTimer = null;
  let beat = 0;
  let nextBeat = 0;

  /** Build the context and the buses on first use; false when unavailable. */
  function ensure() {
    if (ac) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ac = new AudioContext();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ac.destination);
      musicGain = ac.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      sfxGain = ac.createGain();
      sfxGain.gain.value = 0.9;
      sfxGain.connect(master);
      // The engine hum: a sawtooth through a low-pass, pitch follows speed.
      engineOsc = ac.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineFilter = ac.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ac.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  /** One oscillator note into a destination bus, with an attack and a decay. */
  function note(freq, dur, type, vol, at, dest, slideTo = 0) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(vol, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  /** A one-shot effect tone on the sfx bus. */
  function blip(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ac || muted) return;
    note(freq, dur, type, vol, ac.currentTime + when, sfxGain, slideTo);
  }

  /** A burst of filtered noise (a gunshot crack, a crash, an explosion). */
  function burst(dur, vol, filterFreq, when = 0) {
    if (!ac || muted) return;
    const t = ac.currentTime + when;
    const length = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    source.start(t);
  }

  /** A hi-hat tick on the music bus. */
  function hat(t) {
    const length = Math.floor(ac.sampleRate * 0.03);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let n = 0; n < length; n += 1) data[n] = (Math.random() * 2 - 1) * (1 - n / length);
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = ac.createGain();
    gain.gain.value = 0.25;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);
    source.start(t);
  }

  /** Schedule the music loop a little ahead of the playhead, one bar at a time. */
  function musicStep() {
    if (!ac || muted) return;
    const beatDur = 60 / MUSIC.bpm / 4;
    while (nextBeat < ac.currentTime + 0.15) {
      const i = beat % 16;
      const bass = MUSIC.bass[i];
      if (bass) {
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.5, nextBeat);
        gain.gain.exponentialRampToValueAtTime(0.001, nextBeat + beatDur * 0.9);
        const osc = ac.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midiToFreq(bass);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(nextBeat);
        osc.stop(nextBeat + beatDur);
      }
      const lead = MUSIC.lead[i];
      if (lead) {
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.12, nextBeat);
        gain.gain.exponentialRampToValueAtTime(0.001, nextBeat + beatDur * 1.6);
        const osc = ac.createOscillator();
        osc.type = 'square';
        osc.frequency.value = midiToFreq(lead);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(nextBeat);
        osc.stop(nextBeat + beatDur * 1.7);
      }
      // Hat on every off-beat step.
      if (i % 2 === 1) hat(nextBeat);
      beat += 1;
      nextBeat += beatDur;
    }
  }

  return {
    /** Call on the first gesture (and on every gesture; it is idempotent). */
    unlock() {
      if (!ensure()) return;
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      if (!musicTimer) {
        nextBeat = ac.currentTime + 0.05;
        musicTimer = window.setInterval(musicStep, 40);
      }
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.55;
      if (engineGain) engineGain.gain.value = muted ? 0 : engineGain.gain.value;
    },
    isMuted() {
      return muted;
    },
    /** Continuous engine hum: speed01 is 0..1, on is whether the player drives. */
    engine(speed01, on) {
      if (!ac || muted) return;
      const target = on ? 0.05 + speed01 * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ac.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, ac.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, ac.currentTime, 0.08);
    },
    /** One siren wail cycle; call about twice a second while police chase. */
    siren() {
      blip(720, 0.42, 'square', 0.05, 0, 940);
      blip(940, 0.42, 'square', 0.05, 0.42, 720);
    },
    shot() {
      burst(0.12, 0.5, 2400);
      blip(180, 0.08, 'square', 0.25, 0, 60);
    },
    punch() {
      burst(0.09, 0.4, 500);
      blip(120, 0.09, 'sine', 0.3, 0, 55);
    },
    crash() {
      burst(0.3, 0.55, 900);
      blip(90, 0.25, 'sine', 0.4, 0, 40);
    },
    explosion() {
      burst(0.7, 0.8, 500);
      blip(70, 0.6, 'sine', 0.5, 0, 30);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.3);
      blip(990, 0.14, 'sine', 0.3, 0.08);
    },
    cash() {
      blip(880, 0.08, 'triangle', 0.3);
      blip(1174, 0.08, 'triangle', 0.3, 0.07);
      blip(1568, 0.16, 'triangle', 0.3, 0.14);
    },
    mission() {
      [523, 659, 784, 1046].forEach((freq, i) => blip(freq, 0.16, 'triangle', 0.32, i * 0.09));
    },
    fail() {
      [392, 330, 262].forEach((freq, i) => blip(freq, 0.2, 'sawtooth', 0.18, i * 0.12));
    },
    busted() {
      blip(220, 0.5, 'sawtooth', 0.25, 0, 110);
      blip(110, 0.7, 'sawtooth', 0.25, 0.4, 55);
    },
    click() {
      blip(1200, 0.04, 'square', 0.12);
    },
  };
}
