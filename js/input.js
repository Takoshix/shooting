/* =========================================================
   input.js — キーボード / タッチ入力
   ========================================================= */
(function (w) {
  'use strict';

  var down = Object.create(null);   // 現在押されているキー
  var pressed = Object.create(null);// このフレームで押された瞬間のキー（エッジ検出）

  var MAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
    KeyZ: 'shot', Space: 'shot',
    KeyX: 'power', Enter: 'power',
    KeyC: 'bomb',
    ShiftLeft: 'slow', ShiftRight: 'slow',
    KeyP: 'pause', KeyM: 'mute', KeyR: 'restart', Escape: 'pause'
  };

  var Input = {
    /* タッチ操作用の仮想スティック状態 */
    touch: { active: false, dx: 0, dy: 0 },
    onFirstInput: null,   // 音の初期化などに使うコールバック
    _fired: false
  };

  function first() {
    if (!Input._fired) {
      Input._fired = true;
      if (Input.onFirstInput) Input.onFirstInput();
    }
  }

  Input.down = function (name) { return !!down[name]; };

  /* 押された瞬間だけ true を返す。読み取ると消える */
  Input.tap = function (name) {
    if (pressed[name]) { pressed[name] = false; return true; }
    return false;
  };

  /* 毎フレーム末尾で呼ぶ。エッジをクリアする */
  Input.endFrame = function () {
    for (var k in pressed) pressed[k] = false;
  };

  Input.axis = function () {
    var x = 0, y = 0;
    if (down.left) x -= 1;
    if (down.right) x += 1;
    if (down.up) y -= 1;
    if (down.down) y += 1;
    if (Input.touch.active) { x = Input.touch.dx; y = Input.touch.dy; }
    var len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x: x, y: y };
  };

  Input.attach = function (canvas) {
    w.addEventListener('keydown', function (e) {
      var n = MAP[e.code];
      if (!n) return;
      e.preventDefault();
      if (!down[n]) pressed[n] = true;
      down[n] = true;
      first();
    }, { passive: false });

    w.addEventListener('keyup', function (e) {
      var n = MAP[e.code];
      if (!n) return;
      e.preventDefault();
      down[n] = false;
    }, { passive: false });

    w.addEventListener('blur', function () {
      for (var k in down) down[k] = false;
      Input.touch.active = false;
    });

    /* --- タッチ / マウスドラッグ：触れた方向へ移動、触れている間は自動連射 --- */
    if (!canvas) return;
    var origin = null;

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - r.left) / r.width, y: (t.clientY - r.top) / r.height };
    }
    function start(e) {
      e.preventDefault();
      first();
      origin = pos(e);
      Input.touch.active = true;
      down.shot = true;
      if (!down.power) pressed.power = true;   // タップでパワーアップも発動
      down.power = true;
    }
    function move(e) {
      if (!origin) return;
      e.preventDefault();
      var p = pos(e);
      var dx = (p.x - origin.x) * 8, dy = (p.y - origin.y) * 8;
      var l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      Input.touch.dx = dx; Input.touch.dy = dy;
    }
    function end(e) {
      if (e) e.preventDefault();
      origin = null;
      Input.touch.active = false;
      Input.touch.dx = Input.touch.dy = 0;
      down.shot = false;
      down.power = false;
    }
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end, { passive: false });
    canvas.addEventListener('touchcancel', end, { passive: false });
    canvas.addEventListener('mousedown', start);
    w.addEventListener('mousemove', move);
    w.addEventListener('mouseup', end);
  };

  w.Input = Input;
})(window);
