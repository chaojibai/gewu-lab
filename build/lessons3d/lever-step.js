/* 格物实验室 · 探究杠杆的平衡条件（three.js 单文件课件）
   鲁教版 八年级下册 · 第九章 简单机械 · 第一节 杠杆

   【严谨】力矩 τ = F·L；钩码重力 F = P.model.weightN(0.05 kg) = 0.5 N/个
           （g = P.model.gN = 10 N/kg）；平衡条件 F₁L₁ = F₂L₂。
           力臂 L 是「支点到力的作用线的垂直距离」：力竖直、杆水平时 L 恰等于
           杆上刻度距离 d；斜向拉（与竖直夹角 φ）时 L = d·cosφ < d。
           净力矩差 Δτ = F₂L₂ − F₁L₁ 驱动横杆倾角缓动（阻尼逼近、机械限位 ±12°，
           不是瞬移、不是写死角度）；恢复平衡所需拉力 F₂′ = F₁L₁/L₂。
           反例：φ=60° 时 L₂ = d₂·cos60° = d₂/2，同样的 F₂ 力矩不足 → 杆倾斜，
           须把拉力加到 F₂′ = 2F₂——「力臂变小、需更大拉力」。
           读数全部由模型实时算，无拟合映射、无硬编码结果。
   【真实感】带刻度横杆架在刀口支架上、两端调平螺母、每件落地器材 P.ground 接地；
           钩码从 HOME 托盘真实挂上 / 取下（lerp 动线，随杆倾斜摆动）；
           斜拉用细绳 + 桌面固定桩 + 支点到作用线的垂线（力臂可视化）；
           材质按 P.MAT，无凭空 visible、无贴纸式平板、无长弧导线。 */
(function () {
  var T = window.THREE, K = window.Lab, C = window.ChemKit, P = window.PhysicsKit;

  /* ── 物理模型参数（唯一真源，所有读数由此推出）────────────────── */
  var G        = P.model.gN;                 // 10 N/kg
  var M_HOOK   = 0.05;                       // 每个钩码 50 g = 0.05 kg
  var W_HOOK   = P.model.weightN(M_HOOK);    // 0.5 N / 个
  var N_POOL   = 4;                          // 每侧钩码池上限
  var BEAM_LEN = 24;                         // 横杆长（cm）
  var D_MAX    = 10;                         // 挂点最大刻度距离（cm）
  var T_REF    = W_HOOK * D_MAX;             // 参考力矩 = 5 N·cm（1 钩码在 10 cm）
  var TILT_MAX = 12 * Math.PI / 180;         // 机械限位倾角（rad）
  var HOME_X   = 9.5, HOME_Z = -8;           // 备料托盘（收进可见区，避开右侧 UI 面板）
  var UP = new T.Vector3(0, 1, 0);

  /* 连续量 / 计数一律 _ 前缀，避开 K.boot 的 0.55 s 步骤补间；
     judged 为布尔字段，补间只处理 number，安全。 */
  var st = {
    _nL: 0, _nR: 0, _dL: 6, _dR: 6,          // 钩码数、挂点刻度距离
    _mode: 0, _phi: 0, _phiT: 0, _rig: 0,     // 0 钩码 / 1 斜拉；斜拉角当前/目标；装置渐显
    _tilt: 0, judged: false, _t: 0
  };
  var O = {};

  /* 模型：τ = F·L，L = d·cosφ，Δτ 判倾斜，F′ 为恢复平衡所需拉力 */
  function mechanics(s) {
    var phi = s._phi * Math.PI / 180;
    var F1 = s._nL * W_HOOK;
    var F2 = s._nR * W_HOOK;                        // 右侧施加的力（保持不变，做对照）
    var L1 = s._dL;                                  // 左侧竖直力 → 力臂 = 杆上刻度
    var L2 = s._mode ? s._dR * Math.cos(phi) : s._dR; // 斜拉 → 支点到作用线的垂直距离
    var tau1 = F1 * L1, tau2 = F2 * L2;             // N·cm
    var dTau = tau2 - tau1;                          // 净力矩差
    var Fneed = L2 > 1e-6 ? tau1 / L2 : 0;          // 恢复平衡所需右侧拉力
    return {
      nL: s._nL, nR: s._nR, dL: s._dL, dR: s._dR,
      phi: phi, phiDeg: s._phi, mode: s._mode,
      F1: F1, F2: F2, L1: L1, L2: L2, tau1: tau1, tau2: tau2,
      dTau: dTau, Fneed: Fneed, bal: Math.abs(dTau) < 1e-6
    };
  }

  /* 单位长度圆柱（y 轴）重算成 p0→p1 线段 */
  function setSeg(o, p0, p1) {
    var d = new T.Vector3().subVectors(p1, p0), L = d.length();
    o.position.copy(p0).addScaledVector(d, .5);
    o.scale.set(1, Math.max(1e-4, L), 1);
    if (L > 1e-6) o.quaternion.setFromUnitVectors(UP, d.clone().normalize());
  }
  function hideSeg(o) { o.scale.set(1e-4, 1e-4, 1e-4); }

  var scene = {
    setup: function () {
      K.envRoom();
      K.scene().traverse(function (o) {
        if (o.isHemisphereLight) o.intensity *= .82;
        else if (o.isDirectionalLight) o.intensity *= .85;
      });
      K.bench(52, 20);

      /* 私有材质：共享 P.MAT.* 的 metalness/envMapIntensity 偏高，在浅色实验室被
         scene.environment 反成惨白（支架/横杆读成白色塑料件）。这里压掉环境反射。 */
      var DARK = new T.MeshStandardMaterial({ color: 0x333b43, roughness: .62, metalness: .25, envMapIntensity: 0 });
      var STEEL = new T.MeshStandardMaterial({ color: 0x697681, roughness: .44, metalness: .5, envMapIntensity: .22 });
      var BRASS = new T.MeshStandardMaterial({ color: 0xb08a4a, roughness: .38, metalness: .68, envMapIntensity: .35 });
      var RUBBER = new T.MeshStandardMaterial({ color: 0x2b2622, roughness: .85, metalness: .05, envMapIntensity: 0 });

      /* ── 刀口支架：底座 / 棱柱 / 黄铜刀口 ── */
      var stand = P.leverStand({ h: 9 }); stand.position.set(0, 0, 0);
      stand.children[0].material = DARK;       // 底座
      stand.children[1].material = STEEL;      // 三棱立柱
      stand.children[2].material = BRASS;      // 刀口（支点）
      K.scene().add(stand); O.stand = stand;
      P.ground(0, 0, 7);
      var topY = stand.userData.topY;

      /* ── 横杆：带刻度 + 两端调平螺母，绕刀口转动 ── */
      var piv = new T.Group(); piv.position.set(0, topY, 0); K.scene().add(piv); O.piv = piv;
      var beam = P.leverBeam({ len: BEAM_LEN });
      beam.children[0].material = STEEL;      // 横杆本体（深金属，不再反白）
      /* 刻度贴片换深底亮线：库里的浅灰底在浅墙前读成一条白贴纸 */
      var bc = document.createElement('canvas'); bc.width = 1024; bc.height = 64;
      var bx = bc.getContext('2d');
      bx.fillStyle = '#48545e'; bx.fillRect(0, 0, 1024, 64);
      bx.fillStyle = '#e8f1f7'; bx.textAlign = 'center'; bx.textBaseline = 'middle';
      bx.font = 'bold 28px Consolas,monospace';
      for (var k = -10; k <= 10; k++) {
        var px = 512 + k * 48;
        bx.fillRect(px, 6, 2, k % 5 === 0 ? 32 : 20);
        if (k % 5 === 0) bx.fillText(String(k), px, 50);
      }
      var btex = new T.CanvasTexture(bc); btex.anisotropy = 8;
      /* 关 mipmap：深底亮线在远处会被 mip 混成密集摩尔纹 */
      btex.minFilter = T.LinearFilter; btex.magFilter = T.LinearFilter;
      btex.generateMipmaps = false;
      if (beam.children[1]) {
        beam.children[1].material.map = btex;
        beam.children[1].material.needsUpdate = true;
        beam.children[1].position.z = .74;   // 离开杆体前表面 .04，消除共面 z-fighting
      }
      piv.add(beam); O.beam = beam;
      [-1, 1].forEach(function (sgn) {
        var nut = new T.Mesh(new T.CylinderGeometry(.55, .55, 1.1, 6), BRASS);
        nut.rotation.z = Math.PI / 2; nut.position.x = sgn * (BEAM_LEN / 2 - .3);
        piv.add(nut);
      });

      /* 挂点 carrier（piv 子物体，随杆倾斜），位置由 _dL / _dR 缓动 */
      function carrier() { var g = new T.Group(); piv.add(g); return g; }
      O.carL = carrier(); O.carR = carrier();
      O.curL = 6; O.curR = 6;
      /* 挂点金属小环：吊线有了明确的起点，钩码串不再读作悬空 */
      [O.carL, O.carR].forEach(function (car) {
        var ring = new T.Mesh(new T.TorusGeometry(.3, .09, 8, 14), BRASS);
        ring.rotation.x = Math.PI / 2; car.add(ring);
      });

      /* ── 备料托盘 + 钩码池：托盘收进可见区，钩码 2×2 平铺（不叠高塔）── */
      [-1, 1].forEach(function (sgn) {
        var tray = new T.Mesh(new T.BoxGeometry(6, .6, 6), DARK);
        tray.position.set(sgn * HOME_X, .3, HOME_Z); K.scene().add(tray);
        /* 四个凹孔：钩码竖放在孔位上，下挂钩落进孔里，不再叠成高塔也不穿托盘 */
        [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) {
          var hole = new T.Mesh(new T.CircleGeometry(.62, 16),
            new T.MeshBasicMaterial({ color: 0x1b2229 }));
          hole.rotation.x = -Math.PI / 2;
          hole.position.set(sgn * HOME_X + a * 1.35, .61, HOME_Z + b * 1.35);
          K.scene().add(hole);
        }); });
        P.ground(sgn * HOME_X, HOME_Z, 3.5);
      });
      /* 钩码刻字：透明底浅色数字小片，替换共享库那块白色「50」方牌 */
      var LC = document.createElement('canvas'); LC.width = LC.height = 128;
      var lc = LC.getContext('2d');
      lc.clearRect(0, 0, 128, 128);
      lc.fillStyle = '#e6edf3'; lc.textAlign = 'center'; lc.textBaseline = 'middle';
      lc.font = 'bold 78px Consolas,monospace'; lc.fillText('50', 64, 64);
      var hookLabel = new T.CanvasTexture(LC); hookLabel.anisotropy = 4;
      function makePool(homeX) {
        var arr = [];
        for (var i = 0; i < N_POOL; i++) {
          var w = P.hookWeight(50);
          w.children[0].material = STEEL;          // 圆柱本体
          w.children[1].material = BRASS;          // 上挂钩
          var lab = w.children[2];                 // 白色方牌 → 贴着本体的小刻字片
          if (lab) {
            lab.material.map = hookLabel; lab.material.transparent = true;
            lab.material.needsUpdate = true; lab.scale.setScalar(.62);
          }
          /* 补下挂钩：钩码串靠上下挂钩咬合，不再是叠落的白色标签方牌 */
          var lower = new T.Mesh(new T.TorusGeometry(.42, .14, 8, 16), BRASS);
          lower.position.y = -.28; w.add(lower);
          /* HOME：2×2 平铺在托盘孔位上（原点在钩码底面，托盘面 y=.6）*/
          var hp = new T.Vector3(homeX + (i % 2 ? 1.35 : -1.35), .62,
            HOME_Z + (i < 2 ? -1.35 : 1.35));
          w.position.copy(hp); w.userData.pos = hp.clone(); w.userData.home = hp.clone();
          K.scene().add(w); arr.push(w);
        }
        return arr;
      }
      O.poolL = makePool(-HOME_X); O.poolR = makePool(HOME_X);

      /* 吊线：挂点 → 钩码串顶端；斜拉绳、固定桩、力臂垂线 */
      function seg(mat, r) {
        var m = new T.Mesh(new T.CylinderGeometry(r, r, 1, 8), mat); K.scene().add(m); return m;
      }
      O.lineL = seg(RUBBER, .10); O.lineR = seg(RUBBER, .10);
      O.pullLine = seg(RUBBER, .10);     // 斜拉绳（力的作用线）
      O.armLine = seg(BRASS, .14);       // 支点到作用线的垂线（= 力臂 L₂，粗·金）
      /* 作用线反向延长用细淡线：与力臂垂线区分开，垂足才有落点又不抢主体 */
      O.extLine = seg(new T.MeshStandardMaterial({ color: 0x5f7583, roughness: .6,
        metalness: .2, envMapIntensity: 0 }), .06);
      O.footMark = new T.Mesh(new T.SphereGeometry(.2, 12, 10), BRASS);
      K.scene().add(O.footMark);
      O.stake = new T.Mesh(new T.CylinderGeometry(.35, .5, 1, 12), STEEL);
      K.scene().add(O.stake);            // 斜拉固定立柱（接桌面，消除悬空）
      O.stakeCap = new T.Mesh(new T.TorusGeometry(.34, .09, 8, 14), BRASS);
      O.stakeCap.rotation.x = Math.PI / 2; K.scene().add(O.stakeCap);
      O.stakeShadow = P.ground(0, HOME_Z, 2);

      K.tag(O.beam, '杠杆（带刻度）', 'F₁L₁ = F₂L₂；水平平衡时刻度即力臂');
      K.tag(O.stand, '刀口支架 + 调平螺母', '实验前调水平平衡，消除杠杆自重影响');
      K.tag(O.stake, '斜拉固定桩', '绳与竖直成 φ，力臂 = d·cosφ 而非杆上刻度');
      O.ready = true;
    },

    update: function (dt, s) {
      s._t += dt;
      /* 连续量缓动：斜拉角、装置渐显、挂点位置（真实物体运动） */
      s._phi += (s._phiT - s._phi) * Math.min(1, dt * 6);
      s._rig += (s._mode - s._rig) * Math.min(1, dt * 5);
      O.curL += (s._dL - O.curL) * Math.min(1, dt * 7);
      O.curR += (s._dR - O.curR) * Math.min(1, dt * 7);
      O.carL.position.x = -O.curL; O.carR.position.x = O.curR;

      var m = mechanics(s);
      /* 倾角由净力矩差 Δτ 驱动：右端力矩大 → 右端下沉（rotation.z < 0），
         限幅在机械挡块内，阻尼缓动逼近，不瞬移、不写死角度。 */
      var target = -TILT_MAX * Math.max(-1, Math.min(1, m.dTau / T_REF));
      s._tilt += (target - s._tilt) * Math.min(1, dt * 4);
      O.piv.rotation.z = s._tilt;

      /* 钩码：挂上的移到 carrier 下方（随杆倾斜摆动），未挂的回 HOME */
      function place(pool, n, car) {
        for (var i = 0; i < pool.length; i++) {
          var w = pool[i], tp;
          /* g 原点在钩码底面、上挂钩在 +2.0；吊线末端在 −1.8，故第一只原点 −3.8，
             吊线正好连到上挂钩而不是穿过钩码本体 */
          if (i < n) tp = P.port(car, 0, -3.8 - i * 1.7, 0);
          else tp = w.userData.home;            // 各自回托盘孔位，不再重排叠塔
          w.userData.pos.lerp(tp, Math.min(1, dt * 8)); w.position.copy(w.userData.pos);
        }
      }
      place(O.poolL, Math.round(s._nL), O.carL);
      place(O.poolR, s._mode ? 0 : Math.round(s._nR), O.carR);

      /* 吊线长度按挂上数量出现（不用凭空 visible） */
      function hang(lineObj, car, n) {
        var p0 = P.port(car, 0, 0, 0), p1 = P.port(car, 0, -1.8, 0);
        if (n > 0) setSeg(lineObj, p0, p1); else hideSeg(lineObj);
      }
      hang(O.lineL, O.carL, s._nL);
      hang(O.lineR, O.carR, s._mode ? 0 : s._nR);

      /* 斜拉装置：绳沿 u 从挂点斜向下到桌面固定桩；垂线 = 力臂 L₂ */
      if (s._rig > 1e-3) {
        var p0 = P.port(O.carR, 0, 0, 0);
        var q = new T.Quaternion(); O.carR.getWorldQuaternion(q);
        var uW = new T.Vector3(Math.sin(m.phi), -Math.cos(m.phi), 0).applyQuaternion(q).normalize();
        /* 绳固定在桌面立柱顶（高 6）：既真实（实验用铁架台夹具斜拉），
           又让绳与桩落在可见区，不会被右侧面板截断 */
        var R = (p0.y - 7.5) / Math.max(.2, -uW.y);
        var p1 = p0.clone().addScaledVector(uW, R * s._rig);
        setSeg(O.pullLine, p0, p1);
        /* 固定立柱随绳末端在桌面上真实滑动，接地阴影跟随 */
        O.stake.scale.set(1, Math.max(1e-4, p1.y), 1);
        O.stake.position.set(p1.x, p1.y / 2, p1.z);
        O.stakeCap.position.set(p1.x, p1.y, p1.z);
        O.stakeCap.visible = true;
        O.footMark.visible = true;
        O.stakeShadow.position.set(p1.x, .04, p1.z);
        /* 作用线反向延长到垂足之后：垂线 O→H 才有落点，不再指向空中 */
        var pExt = p0.clone().addScaledVector(uW, -1.15 * m.dR * Math.sin(m.phi) * s._rig);
        setSeg(O.extLine, p0, pExt);
        /* 力臂垂线：支点 O → 作用线垂足 H（杆局部 H = d₂cosφ·(cosφ, sinφ)） */
        var a0 = P.port(O.piv, 0, 0, 0);
        var L2 = m.dR * Math.cos(m.phi);
        var a1 = P.port(O.piv,
          L2 * Math.cos(m.phi) * s._rig,
          L2 * Math.sin(m.phi) * s._rig, 0);
        setSeg(O.armLine, a0, a1);
        O.footMark.position.copy(a1);
      } else {
        hideSeg(O.pullLine); hideSeg(O.armLine); hideSeg(O.extLine);
        O.footMark.visible = false;
        O.stake.scale.set(1, 1e-4, 1);
        O.stakeCap.visible = false;
      }
    }
  };

  /* reset 不强行归零 _tilt / _phi / _rig，交回 update 缓动，避免瞬移 */
  function reset(s) {
    s._nL = 0; s._nR = 0; s._dL = 6; s._dR = 6;
    s._mode = 0; s._phiT = 0; s.judged = false;
  }
  function pull(s, deg) { s._mode = 1; s._phiT = deg; }
  function weights(s) { s._mode = 0; s._phiT = 0; }

  K.boot({
    title: '探究杠杆的平衡条件',
    chip: '物理 · 鲁教版 · 八下 · 第九章 简单机械 · 第一节 杠杆',
    hint: '拖空白处旋转 · 滚轮缩放 · ←/→ 切换步骤',
    state: st, scene: scene,
    cam: { ty: 10.5, dist: 46, tx: 5, tz: 0, yaw: .2, pitch: .3 },
    reads: [['leftN', '左 F₁'], ['rightN', '右 F₂'], ['arms', '力臂 L'], ['balance', '平衡'],
            ['tau', '力矩 τ'], ['dtau', '净力矩差 Δτ'], ['need', '平衡所需 F₂′'],
            ['phi', '斜拉角 φ'], ['tilt', '杆倾角']],
    values: function (s) {
      var m = mechanics(s);
      return {
        leftN: 'F₁=' + m.F1.toFixed(2) + ' N (' + m.nL + '×' + W_HOOK.toFixed(1) + ')',
        rightN: 'F₂=' + m.F2.toFixed(2) + ' N' + (m.mode ? '（斜拉）' : ''),
        arms: 'L₁=' + m.L1.toFixed(1) + '  L₂=' + m.L2.toFixed(1) + ' cm',
        balance: m.bal ? '已平衡' : ('不平衡 Δτ=' + m.dTau.toFixed(2)),
        tau: 'τ₁=' + m.tau1.toFixed(2) + '  τ₂=' + m.tau2.toFixed(2) + ' N·cm',
        dtau: 'Δτ=' + m.dTau.toFixed(2) + ' N·cm',
        need: m.mode ? ('F₂′=' + m.Fneed.toFixed(2) + ' N（恢复平衡所需）') : '—',
        phi: m.mode ? ('φ=' + m.phiDeg.toFixed(0) + '°  cosφ=' + Math.cos(m.phi).toFixed(2)) : '竖直力 φ=0°',
        tilt: (s._tilt * 180 / Math.PI).toFixed(1) + '°'
      };
    },
    steps: [
      { name: '调水平', title: '把杠杆调到水平平衡',
        ask: '为什么实验前要让杠杆在水平位置平衡？',
        body: '<p><b>操作：</b>调节横杆两端的<b>调平螺母</b>，使杠杆在不挂钩码时于<b>水平</b>位置平衡。</p>' +
          '<p><b>模型：</b>力矩 <b>τ = F·L</b>，钩码重力 <b>F = P.model.weightN(m) = m·g = 0.05×' + G + ' = ' + W_HOOK.toFixed(1) + ' N</b>（每个钩码 50 g → 0.5 N）；' +
          '平衡条件 <b>F₁L₁ = F₂L₂</b>。力臂 <b>L 是支点到力的作用线的垂直距离</b>。</p>' +
          '<p><b>边界 / 假设：</b>钩码竖直下拉、杆水平时，作用线竖直，垂直距离恰好等于<b>杆上刻度距离 d</b>；' +
          '忽略刀口摩擦与横杆自重（调平已用螺母抵消）。一旦力不再竖直或杆倾斜，L ≠ d。</p>' +
          '<p><b>易错：</b>不调平就实验，杠杆自重会贡献附加力矩；且<b>调平之后</b>全程只能用增减/移动钩码调平衡，<b>不可再动平衡螺母</b>。</p>',
        apply: function (s) { reset(s); },
        controls: [{ type: 'btn', label: '调水平平衡（清空力矩）', onClick: function (s) { reset(s); } }],
        cam: { tx: 5, ty: 11, tz: 0, dist: 44, yaw: .2, pitch: .32 } },
      { name: '挂钩码', title: '挂不同钩码，调平衡',
        ask: '杠杆平衡时，动力×动力臂与阻力×阻力臂有什么关系？',
        body: '<p><b>操作：</b>两侧挂不同数量钩码、移动挂点位置，直到横杆重新水平平衡；右侧读数每帧由模型算。</p>' +
          '<p><b>模型：</b>F₁ = n₁·' + W_HOOK.toFixed(1) + '、F₂ = n₂·' + W_HOOK.toFixed(1) + ' N；' +
          'L₁ = d₁、L₂ = d₂（cm）；<b>τ₁ = F₁L₁、τ₂ = F₂L₂、净力矩差 Δτ = τ₂ − τ₁</b>。' +
          '横杆倾角 θ = −' + (TILT_MAX * 180 / Math.PI).toFixed(0) + '°·clamp(Δτ/' + T_REF.toFixed(0) + ', −1, 1)，由 Δτ <b>阻尼缓动</b>驱动，不是瞬移。</p>' +
          '<p><b>例：</b>左 2 个（F₁=' + (2 * W_HOOK).toFixed(1) + ' N）挂 L₁=6，右 3 个（F₂=' + (3 * W_HOOK).toFixed(1) + ' N）挂 L₂=4：' +
          'τ₁ = ' + (2 * W_HOOK * 6).toFixed(1) + '、τ₂ = ' + (3 * W_HOOK * 4).toFixed(1) + ' N·cm，相等即平衡。</p>' +
          '<p><b>边界 / 假设：</b>刀口无摩擦、杆重已被调平螺母抵消、钩码力竖直；' +
          '倾角只是 Δτ 在机械限位内的可视化指示（真实杠杆不平衡会持续转动到挡块），' +
          '且 θ 公式仅在力竖直、或已按 L = d·cosφ 折算时成立。</p>' +
          '<p><b>反例 / 易错：</b>只看钩码数会判错——2 个 ≠ 3 个却平衡，因为力臂不同；另一个常见错误是把 50 g 钩码当成 1 N（实为 ' + W_HOOK.toFixed(1) + ' N）。</p>',
        apply: function (s) { reset(s); s._nL = 2; s._nR = 3; s._dR = 6; },
        controls: [
          { type: 'btn', label: '左 +1 钩码', onClick: function (s) { if (s._nL < N_POOL) s._nL++; } },
          { type: 'btn', label: '左 −1 钩码', onClick: function (s) { if (s._nL > 0) s._nL--; } },
          { type: 'btn', label: '右 +1 钩码', onClick: function (s) { if (s._nR < N_POOL) s._nR++; } },
          { type: 'btn', label: '右 −1 钩码', onClick: function (s) { if (s._nR > 0) s._nR--; } },
          { type: 'btn', label: '右臂 L₂=4（配平）', onClick: function (s) { s._dR = 4; } },
          { type: 'btn', label: '右臂 L₂=6', onClick: function (s) { s._dR = 6; } }
        ],
        cam: { tx: 5, ty: 9.5, tz: 1, dist: 38, yaw: .2, pitch: .34 } },
      { name: '改变力臂', title: '改变阻力臂，再平衡',
        ask: '右臂从 6 变 3，要保持平衡右端钩码数怎么变？',
        body: '<p><b>操作：</b>把右端钩码移到更近位置（d₂ 变小），或把竖直力改成<b>斜向拉</b>，观察力臂与读数变化。</p>' +
          '<p><b>模型：</b>力臂是<b>支点到作用线的垂直距离</b>。竖直力 L₂ = d₂；斜拉（与竖直夹角 φ）时 <b>L₂ = d₂·cosφ</b>。' +
          '平衡所需右侧拉力 <b>F₂′ = F₁L₁ / L₂</b>。取 F₁=' + (2 * W_HOOK).toFixed(1) + ' N、L₁=6：' +
          'd₂=6 时 L₂=6、F₂′=' + (2 * W_HOOK * 6 / 6).toFixed(1) + ' N；d₂=3 时 L₂=3、F₂′=' + (2 * W_HOOK * 6 / 3).toFixed(1) + ' N——力臂减半、力加倍。</p>' +
          '<p><b>反例（斜拉对照）：</b>保持拉力 F₂ 与挂点 d₂ 不变，只把绳<b>斜拉 φ=60°</b>，则 L₂ = d₂·cos60° = d₂/2，' +
          'τ₂ = F₂L₂ 减半 → Δτ < 0 → 杆向左侧下沉（缓动）；要恢复平衡须 F₂′ = F₁L₁/L₂ = 2F₂。' +
          '按下方「竖直拉 / 斜拉 60°」对照，<b>力臂、力矩、拉力、杆倾角读数随之实时改变</b>。</p>' +
          '<p><b>边界 / 假设：</b>cosφ 在 0°≤φ&lt;90° 有效；φ→90° 时 L₂→0、F₂′→∞（作用线过支点，无法平衡）。' +
          '3D 中从支点画到作用线的<b>垂线</b>就是 L₂，斜拉时明显短于杆上刻度 d₂。</p>',
        apply: function (s) { reset(s); s._nL = 2; s._nR = 2; s._dL = 6; s._dR = 6; },
        controls: [
          { type: 'btn', label: '右臂 L₂=6', onClick: function (s) { s._dR = 6; } },
          { type: 'btn', label: '右臂 L₂=3', onClick: function (s) { s._dR = 3; } },
          { type: 'btn', label: '竖直拉 φ=0°', onClick: function (s) { pull(s, 0); } },
          { type: 'btn', label: '斜拉 φ=60°（反例）', onClick: function (s) { pull(s, 60); } },
          { type: 'btn', label: '回到钩码模式', onClick: function (s) { weights(s); } }
        ],
        cam: { tx: 5, ty: 9.5, tz: 1, dist: 40, yaw: .2, pitch: .32 } },
      { name: '结论', title: '归纳杠杆平衡条件',
        ask: '省力杠杆的力臂关系是什么？',
        body: '<p><b>杠杆平衡条件：</b><b>F₁L₁ = F₂L₂</b>；分类：L₁&gt;L₂ 省力、L₁&lt;L₂ 费力、L₁=L₂ 等臂（天平）。' +
          '本课件所有 F 由 P.model.weightN(0.05n) 实时算，L、τ、Δτ 由模型实时算。</p>' +
          '<p><b>反例复盘：</b>误把<b>杆上刻度 d 当力臂</b>是最典型错误。斜拉 φ=60° 时 L₂ = d₂·cos60° = ' +
          (6 * Math.cos(60 * Math.PI / 180)).toFixed(1) + ' cm（d₂=6），而恢复平衡所需 F₂′ = ' +
          (2 * W_HOOK * 6 / (6 * Math.cos(60 * Math.PI / 180))).toFixed(1) + ' N = 2×F₂。' +
          '力臂变小 → 净力矩差 Δτ≠0 → 杆倾斜；只有把力加到 2 倍或把绳拉回竖直才能重新平衡。</p>' +
          '<p><b>边界 / 假设：</b>刀口无摩擦、杆重已被调平螺母抵消、钩码力竖直；本模型未计杆倾斜后自重恢复力矩，' +
          '倾角仅作 Δτ 的限位可视化指示（真实杠杆不平衡会持续转动直到挡块）。' +
          '<b>易错：</b>调平之后不可再调平衡螺母，只能增减 / 移动钩码。</p>',
        apply: function (s) { reset(s); s._nL = 2; s._nR = 2; s._dL = 6; s._dR = 6; pull(s, 60); s.judged = true; },
        controls: [
          { type: 'btn', label: '竖直拉 φ=0°（平衡）', onClick: function (s) { pull(s, 0); } },
          { type: 'btn', label: '斜拉 φ=60°（反例）', onClick: function (s) { pull(s, 60); } },
          { type: 'btn', label: '判定 F₁L₁=F₂L₂', onClick: function (s) { s.judged = true; } }
        ],
        cam: { tx: 5, ty: 10.5, tz: 0, dist: 46, yaw: .2, pitch: .3 } }
    ],
    quiz: function () {
      var bank = [
        { q: '杠杆平衡条件是？', opts: ['F₁L₁=F₂L₂', 'F₁+F₂=0', 'L₁=L₂', 'F₁=F₂'], ans: 'F₁L₁=F₂L₂', why: '杠杆原理：动力×动力臂 = 阻力×阻力臂。' },
        { q: '50 g 钩码的重力约为？', opts: ['0.5 N', '1 N', '5 N', '50 N'], ans: '0.5 N', why: 'F = mg = 0.05 kg × 10 N/kg = 0.5 N。' },
        { q: '斜向拉时力臂如何变？', opts: ['L=d·cosφ，变小', 'L=d，不变', '变大', '为零'], ans: 'L=d·cosφ，变小', why: '力臂是支点到作用线的垂直距离，斜拉时小于杆上刻度。' },
        { q: '平衡后实验中可否调平衡螺母？', opts: ['不可', '可以', '随便', '必须'], ans: '不可', why: '调平后只能用增减 / 移动钩码调平衡。' }
      ];
      return bank[Math.floor(Math.random() * bank.length)];
    }
  });
})();
