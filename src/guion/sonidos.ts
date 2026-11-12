// Sonidos cortos hechos con Web Audio (sin archivos): cada acción suena.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Una nota que cambia de tono (de `desde` a `hasta` Hz) y se apaga. */
function nota(
  desde: number,
  hasta: number,
  dura: number,
  tipo: OscillatorType = 'sine',
  volumen = 0.18,
  espera = 0,
): void {
  const a = audio();
  if (!a) {
    return;
  }
  const t = a.currentTime + espera;
  const osc = a.createOscillator();
  const gan = a.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(desde, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, hasta), t + dura);
  gan.gain.setValueAtTime(0.0001, t);
  gan.gain.exponentialRampToValueAtTime(volumen, t + 0.015);
  gan.gain.exponentialRampToValueAtTime(0.0001, t + dura);
  osc.connect(gan).connect(a.destination);
  osc.start(t);
  osc.stop(t + dura + 0.02);
}

export const sonidos = {
  pop: () => nota(320, 760, 0.12, 'sine', 0.22),
  clic: () => nota(900, 600, 0.05, 'square', 0.08),
  maullido: () => {
    nota(520, 880, 0.16, 'triangle', 0.16);
    nota(880, 430, 0.34, 'triangle', 0.16, 0.15);
  },
  burbuja: () => nota(660, 990, 0.09, 'sine', 0.12),
  campana: () => {
    nota(1320, 1300, 0.5, 'sine', 0.16);
    nota(1760, 1740, 0.4, 'sine', 0.1, 0.12);
  },
  error: () => nota(220, 140, 0.22, 'sawtooth', 0.1),
  logro: () => {
    nota(523, 523, 0.12, 'sine', 0.16);
    nota(659, 659, 0.12, 'sine', 0.16, 0.11);
    nota(784, 784, 0.22, 'sine', 0.16, 0.22);
  },
};
