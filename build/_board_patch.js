/* 黑板板书补丁（构建期由 build_chem.py 注入，数据来自 BOARD 表）。
   放在课件 IIFE 之后执行：K.boot 已同步跑完 scene.setup()，场景里的黑板已存在。
   三种情形：
     ① 课件自带 envRoom 黑板（19.2×9.6）→ 直接换贴图；
     ② 实验室台面场景但没黑板 → 新建一块 16×8 黑板挂在两窗之间的后墙上；
     ③ 微观/自然场景（无教室墙）→ 不建 3D 黑板，在右侧面板顶部插公式条。
   重复 apply 三次，保证覆盖课件自己可能延迟写的板书；重复调用靠 name/尺寸幂等。 */
(function () {
  var D = __BOARD_DATA__;
  var T = window.THREE, K = window.Lab;
  if (!T || !K || !K.scene) return;

  function makeTex() {
    var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
    var x = cv.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#31493f'); g.addColorStop(1, '#263b33');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    /* 粉笔擦痕，避免纯色塑料板 */
    x.globalAlpha = .07; x.strokeStyle = '#e8f0ea'; x.lineWidth = 4; x.lineCap = 'round';
    for (var k = 0; k < 7; k++) {
      var x0 = 60 + Math.random() * 800, y0 = 60 + Math.random() * 400;
      x.beginPath(); x.moveTo(x0, y0);
      x.lineTo(x0 + 60 + Math.random() * 110, y0 + (Math.random() - .5) * 28); x.stroke();
    }
    x.globalAlpha = .97; x.fillStyle = '#eef5ee';
    x.font = 'bold 48px "Microsoft YaHei", Georgia, serif';
    x.fillText(D.title, 54, 78);
    /* 含 → / = / ↑ / ↓ / ⇌ 的行视为公式或定量式，用淡黄大字突出 */
    for (var i = 0; i < D.lines.length; i++) {
      var line = D.lines[i];
      var isF = /[→=↑↓⇌]/.test(line);
      x.fillStyle = isF ? '#ffe6a6' : '#eef5ee';
      x.font = (isF ? 'bold 42px ' : '38px ') + '"Microsoft YaHei", Georgia, serif';
      x.fillText(line, 64, 150 + i * 74);
    }
    x.globalAlpha = .45; x.fillStyle = '#cfe0d5';
    x.font = '21px "Microsoft YaHei", sans-serif';
    x.fillText('格物实验室 · 鲁教版化学', 706, 486);
    var t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; return t;
  }

  function findBoard(sc) {
    var b = null;
    sc.traverse(function (m) {
      if (b || !m.isMesh || !m.geometry) return;
      if (m.name === 'BOARD_PATCH') { b = m; return; }
      if (m.geometry.type === 'PlaneGeometry' && m.geometry.parameters &&
          Math.abs(m.geometry.parameters.width - 19.2) < .01 &&
          Math.abs(m.geometry.parameters.height - 9.6) < .01) b = m;
    });
    return b;
  }

  function newBoard(sc) {
    var b = new T.Mesh(new T.PlaneGeometry(16, 8),
      new T.MeshStandardMaterial({ roughness: .92, side: T.DoubleSide }));
    b.position.set(0, 6.2, -20.85);   /* 默认后墙 z=-21，两扇高窗 x=-14 / 13 之间的空档 */
    b.name = 'BOARD_PATCH';
    sc.add(b);
    var fm = new T.MeshStandardMaterial({ color: 0xb9c0c8, roughness: .45, metalness: .3 });
    [[0, 10.45, 16.8, .5], [0, 1.95, 16.8, .5], [-8.25, 6.2, .5, 9], [8.25, 6.2, .5, 9]]
      .forEach(function (a) {
        var bar = new T.Mesh(new T.BoxGeometry(a[2], a[3], .5), fm);
        bar.position.set(a[0], a[1], -20.6); sc.add(bar);
      });
    return b;
  }

  function domBar() {
    var aside = document.querySelector('aside');
    if (!aside || document.getElementById('boardFormulaBar')) return;
    var bar = document.createElement('div');
    bar.id = 'boardFormulaBar';
    bar.style.cssText = 'margin:0 0 12px;padding:10px 13px;border-radius:10px;' +
      'background:#1c3a33;color:#eaf4ee;font-size:13px;line-height:1.75;' +
      'border-left:3px solid #6fd3c2;box-shadow:0 4px 14px rgba(12,36,32,.18)';
    bar.innerHTML = '<div style="font-size:11px;letter-spacing:1.5px;color:#9fd6c8;' +
      'margin-bottom:5px">本课题要式</div>' +
      D.lines.map(function (s) {
        return '<div style="' + (/[→=↑↓⇌]/.test(s) ? 'color:#ffe6a6;font-weight:600' : '') + '">' + s + '</div>';
      }).join('');
    aside.insertBefore(bar, aside.firstChild);
  }

  function apply() {
    var sc = K.scene();
    if (!sc) return;
    var b = findBoard(sc);
    if (!b && D.make) b = newBoard(sc);
    if (b) {
      var old = b.material.map;
      b.material.map = makeTex();
      b.material.needsUpdate = true;
      if (old && old.dispose) old.dispose();
    } else if (D.dom) {
      domBar();
    }
  }

  apply();
  setTimeout(apply, 400);
  setTimeout(apply, 1400);
})();
