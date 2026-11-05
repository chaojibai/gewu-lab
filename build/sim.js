/* 格物实验室 · 仿真模型层
   所有读数/现象由物理化学模型计算，不是时间线脚本。
   单位约定：浓度 mol/L，体积 mL，物质的量 mol，温度 ℃，压强 kPa，气体体积 mL。 */
window.Sim = (function () {
  'use strict';

  var Kw25 = 1e-14;

  /* 水的离子积随温度变化（近似：ln Kw 随 1/T 线性） */
  function kw(tC) {
    var T = tC + 273.15;
    var dH = 55900;                       /* J/mol */
    return Kw25 * Math.exp(-dH / 8.314 * (1 / T - 1 / 298.15));
  }

  /* 强酸-强碱体系 pH：物料守恒 + 水的自偶电离精确解
     cB/vB 碱（NaOH），cA/vA 酸（HCl）。返回 pH。 */
  function pH(o) {
    var nB = (o.cB || 0) * (o.vB || 0) / 1000;
    var nA = (o.cA || 0) * (o.vA || 0) / 1000;
    var v = ((o.vB || 0) + (o.vA || 0)) / 1000;
    var K = kw(o.temp === undefined ? 25 : o.temp);
    if (v <= 0) return 7;
    var D = (nB - nA) / v;                /* >0 碱过量，<0 酸过量 */
    var s = Math.sqrt(D * D + 4 * K);
    var OH = (D + s) / 2;                 /* [OH-] */
    var H = K / OH;                       /* [H+] */
    if (H <= 0) return 7;
    return -Math.log10(H);
  }

  /* 生成滴定曲线：[{v, pH}] */
  function curve(o, vMax, step) {
    step = step || .5;
    var out = [], v;
    for (v = 0; v <= vMax + 1e-9; v += step) {
      out.push({ v: v, pH: pH({ cB: o.cB, vB: o.vB, cA: o.cA, vA: v, temp: o.temp }) });
    }
    return out;
  }

  /* 等当点体积（mL）：中和所需酸的体积 */
  function equivalence(o) {
    if (!o.cA) return 0;
    return (o.cB * o.vB) / o.cA;
  }

  /* 酚酞显色：pH<8.2 无色，8.2~10 渐红，>10 全红。返回 0..1 */
  function phenolphthalein(p) {
    return Math.max(0, Math.min(1, (p - 8.2) / 1.6));
  }

  /* 石蕊：酸红（0）→ 中紫（.5）→ 碱蓝（1） */
  function litmus(p) {
    return Math.max(0, Math.min(1, (p - 4.5) / 4.5));
  }

  /* 理想气体：V(mL) = nRT/p */
  function gasVolume(o) {
    var T = (o.temp === undefined ? 25 : o.temp) + 273.15;
    var p = (o.p === undefined ? 101.3 : o.p) * 1000;   /* Pa */
    return (o.n || 0) * 8.314 * T / p * 1e6;            /* m³ → mL */
  }

  /* 排水集气：收集到体积 V 所需气体物质的量 */
  function molesForVolume(VmL, o) {
    o = o || {};
    var T = (o.temp === undefined ? 25 : o.temp) + 273.15;
    var p = (o.p === undefined ? 101.3 : o.p) * 1000;
    return VmL * 1e-6 * p / (8.314 * T);
  }

  /* 稀释：c1·V1 = c2·(V1+V2) */
  function dilute(c1, v1, v2) {
    return c1 * v1 / (v1 + v2);
  }

  /* 摩尔质量表（g/mol） */
  var MM = {
    O2: 32, CO2: 44, H2: 2, H2O: 18,
    NaOH: 40, HCl: 36.5, CaCO3: 100, KMnO4: 158,
    CuSO4: 160, Fe: 56, S: 32, P: 31, Mg: 24, Zn: 65, Cu: 64
  };

  /* n = m / M */
  function moles(mass, formula) {
    return mass / (MM[formula] || 1);
  }

  /* 阿伦尼乌斯温度因子（相对 25℃） */
  function arrhenius(tC, Ea) {
    var T = tC + 273.15, T0 = 298.15;
    Ea = Ea === undefined ? 50000 : Ea;
    return Math.exp(-Ea / 8.314 * (1 / T - 1 / T0));
  }

  return {
    kw: kw, pH: pH, curve: curve, equivalence: equivalence,
    phenolphthalein: phenolphthalein, litmus: litmus,
    gasVolume: gasVolume, molesForVolume: molesForVolume,
    dilute: dilute, moles: moles, MM: MM, arrhenius: arrhenius
  };
})();
