/* =========================================================
   audio.js — WebAudio による効果音と BGM（音声ファイル不要）
   ---------------------------------------------------------
   BGM は「レイヤー方式」。武器が強くなるほど楽器が増える。
   音でも “強くなった感” を出すのが狙い。
   ========================================================= */
(function (w) {
  'use strict';

  var Snd = {
    ctx: null, master: null, muted: false,
    layer: 0,          // 0..3 パワーに応じて外から更新する
    ready: false
  };

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  Snd.init = function () {
    if (Snd.ctx) return;
    try {
      var AC = w.AudioContext || w.webkitAudioContext;
      if (!AC) return;
      Snd.ctx = new AC();
      Snd.master = Snd.ctx.createGain();
      Snd.master.gain.value = CFG.audio.master;
      Snd.master.connect(Snd.ctx.destination);
      Snd.ready = true;
      startBgm();
    } catch (e) { Snd.ready = false; }
  };

  Snd.resume = function () {
    if (Snd.ctx && Snd.ctx.state === 'suspended') Snd.ctx.resume();
  };

  Snd.toggleMute = function () {
    Snd.muted = !Snd.muted;
    if (Snd.master) Snd.master.gain.value = Snd.muted ? 0 : CFG.audio.master;
    return Snd.muted;
  };

  /* --- 汎用：エンベロープ付きの単発音 --- */
  function blip(opt) {
    if (!Snd.ready || Snd.muted) return;
    var c = Snd.ctx, t = c.currentTime;
    var o = c.createOscillator(), g = c.createGain();
    o.type = opt.type || 'square';
    o.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1 && opt.f1 !== opt.f0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.f1), t + opt.dur);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opt.vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + opt.dur);
    o.connect(g); g.connect(Snd.master);
    o.start(t); o.stop(t + opt.dur + 0.02);
  }

  /* --- 汎用：ノイズ（爆発用） --- */
  function noise(dur, vol, f0, f1) {
    if (!Snd.ready || Snd.muted) return;
    var c = Snd.ctx, t = c.currentTime;
    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var flt = c.createBiquadFilter(); flt.type = 'lowpass';
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(flt); flt.connect(g); g.connect(Snd.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  /* --- 効果音 --- */
  var shotCool = 0;
  Snd.shot = function (level) {
    // 連射が速くなっても音が団子にならないよう間引く
    var now = Snd.ctx ? Snd.ctx.currentTime : 0;
    if (now < shotCool) return;
    shotCool = now + 0.045;
    blip({ type: 'square', f0: 1250 + level * 90, f1: 420, dur: 0.055, vol: 0.075 });
  };
  Snd.laser = function () { blip({ type: 'sawtooth', f0: 900, f1: 2400, dur: 0.09, vol: 0.07 }); };
  Snd.hit   = function () { blip({ type: 'square', f0: 320, f1: 160, dur: 0.035, vol: 0.05 }); };
  Snd.boom  = function (size) {
    size = size || 1;
    noise(0.16 + 0.22 * size, 0.30 * Math.min(1.4, size), 1400, 90);
    if (size > 1.2) blip({ type: 'triangle', f0: 150, f1: 40, dur: 0.4, vol: 0.22 });
  };
  Snd.power = function () { blip({ type: 'square', f0: 660, f1: 1320, dur: 0.12, vol: 0.12 }); };
  Snd.equip = function () {
    blip({ type: 'square', f0: 523, f1: 523, dur: 0.08, vol: 0.11 });
    setTimeout(function () { blip({ type: 'square', f0: 784, f1: 1046, dur: 0.16, vol: 0.11 }); }, 70);
  };
  Snd.bell  = function (step) { blip({ type: 'triangle', f0: 880 + step * 180, f1: 1760 + step * 180, dur: 0.14, vol: 0.13 }); };
  Snd.death = function () { noise(0.9, 0.42, 900, 60); blip({ type: 'sawtooth', f0: 380, f1: 30, dur: 0.9, vol: 0.2 }); };
  Snd.bomb  = function () { noise(1.1, 0.42, 2600, 70); blip({ type: 'triangle', f0: 90, f1: 28, dur: 0.9, vol: 0.3 }); };

  /* =========================================================
     BGM：先読みスケジューラ方式
     setInterval で少し先の音符を予約していく。これが WebAudio で
     テンポを安定させる定番のやり方（look-ahead scheduling）。
     ========================================================= */
  var step = 0, nextTime = 0, timer = null;

  // コード進行（Am - F - C - G）のルート音と構成音（MIDI ノート番号）
  var PROG = [
    { root: 45, notes: [57, 60, 64, 69] },
    { root: 41, notes: [53, 57, 60, 65] },
    { root: 48, notes: [55, 60, 64, 67] },
    { root: 43, notes: [55, 59, 62, 67] }
  ];

  function voice(type, freq, time, dur, vol, filterHz) {
    var c = Snd.ctx;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(vol, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
    if (filterHz) {
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = filterHz;
      o.connect(f); f.connect(g);
    } else { o.connect(g); }
    g.connect(Snd.master);
    o.start(time); o.stop(time + dur + 0.02);
  }

  function hat(time, vol) {
    var c = Snd.ctx;
    var len = Math.floor(c.sampleRate * 0.04);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var s = c.createBufferSource(); s.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    var g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(Snd.master);
    s.start(time); s.stop(time + 0.05);
  }

  function scheduleStep(i, time) {
    var v = CFG.audio.bgm;
    if (Snd.muted || v <= 0) return;
    var bar = (i >> 4) % PROG.length;
    var ch = PROG[bar];
    var s16 = i & 15;

    /* レイヤー0：ベース＋キック（常時） */
    if (s16 % 2 === 0) {
      voice('triangle', midi(ch.root - 12), time, 0.17, 0.22 * v, 600);
    }
    if (s16 % 8 === 0) {
      voice('sine', 110, time, 0.13, 0.5 * v, 300);
    }

    /* レイヤー1：アルペジオ（パワーが少し付いたら） */
    if (Snd.layer >= 1) {
      var n = ch.notes[(i * 3) % ch.notes.length];
      voice('square', midi(n), time, 0.11, 0.085 * v, 2600);
    }
    /* レイヤー2：ハイハット */
    if (Snd.layer >= 2 && s16 % 2 === 1) hat(time, 0.05 * v);

    /* レイヤー3：リード（フル装備） */
    if (Snd.layer >= 3 && s16 % 4 === 0) {
      var lead = ch.notes[ch.notes.length - 1] + 12;
      voice('sawtooth', midi(lead), time, 0.22, 0.06 * v, 3200);
    }
  }

  function startBgm() {
    if (!Snd.ready || timer) return;
    var spb = 60 / CFG.audio.bpm;   // 1 拍の秒数
    var s16dur = spb / 4;           // 16 分音符
    nextTime = Snd.ctx.currentTime + 0.1;
    timer = setInterval(function () {
      if (!Snd.ctx) return;
      var horizon = Snd.ctx.currentTime + 0.2;
      var guard = 0;
      while (nextTime < horizon && guard++ < 64) {
        scheduleStep(step, nextTime);
        step = (step + 1) & 63;
        nextTime += s16dur;
      }
    }, 40);
  }

  w.Snd = Snd;
})(window);
