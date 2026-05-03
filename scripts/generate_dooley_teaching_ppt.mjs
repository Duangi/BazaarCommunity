import pptxgen from 'pptxgenjs';

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Duang';
pptx.company = 'Duang.work';
pptx.subject = 'Dooley 数值核心教学';
pptx.title = 'Dooley 数值核心教学';
pptx.lang = 'zh-CN';

const C = {
  bg: '121216',
  title: 'FFC107',
  text: 'E8E8E8',
  muted: 'A9A9B1',
  panel: '1B1F2A',
};

function baseSlide() {
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  return s;
}

function addHeader(s, title, subtitle='') {
  s.addText(title, {
    x: 0.5, y: 0.35, w: 12.6, h: 0.6,
    fontFace: 'Microsoft YaHei', fontSize: 30, bold: true, color: C.title,
  });
  if (subtitle) {
    s.addText(subtitle, {
      x: 0.52, y: 0.95, w: 12.2, h: 0.4,
      fontFace: 'Microsoft YaHei', fontSize: 16, color: C.muted,
    });
  }
}

function bullets(s, lines, y=1.7, size=22) {
  const runs = lines.map((t) => ({
    text: `${t}`,
    options: { bullet: { indent: 20 }, breakLine: true }
  }));
  s.addText(runs, {
    x: 0.8, y, w: 12.0, h: 5.2,
    fontFace: 'Microsoft YaHei', fontSize: size, color: C.text,
    paraSpaceAfterPt: 12,
  });
}

let s = baseSlide();
addHeader(s, 'Dooley 数值核心教学', '武装核心 / 引燃核心 / 装甲核心｜实战摆位与运转思路');
bullets(s, [
  '🎯 目标：学会围绕数值核心构建“左运转、右吃数值”的稳定体系',
  '🧠 结论：核心动得越快，右侧收益越高；干扰对手为我方叠层争取时间',
  '🛠 配套：鸡煲实验室用于验证摆法是否合理（计算伤害 + 对比方案）',
], 2.1, 23);

s = baseSlide();
addHeader(s, '1. 设计初衷（为什么要学数值核心）');
bullets(s, [
  '数值核心强在“可滚雪球”：每次触发都放大后续收益',
  '高手差距主要来自调轴与摆位，而不是只看卡面数值',
  '同一套牌，站位不同，上限差距非常大',
  '本教学聚焦稳定体系：暂不覆盖飞核、随机充能、随机加速',
]);

s = baseSlide();
addHeader(s, '2. 通用结构：左运转｜中核心｜右收益');
bullets(s, [
  '左侧：GPU、遥控装置、短CD组件（让核心更快触发）',
  '中间：武装 / 引燃 / 装甲核心（数值成长引擎）',
  '右侧：武器/灼烧/护盾收益牌（吃成长后的输出）',
  '先保证“核心转速”，再追“右侧收益质量”',
]);

s = baseSlide();
addHeader(s, '3. 三个核心怎么选');
bullets(s, [
  '武装核心：偏爆发，适合高频武器，压短局能力强',
  '引燃核心：偏持续压制，适合灼烧体系，越拖越强',
  '装甲核心：偏稳健反打，适合护盾联动与容错',
  '共性：核心多动一次，整个右侧强度就上一个台阶',
]);

s = baseSlide();
addHeader(s, '4. 为什么要带干扰牌');
bullets(s, [
  '时流屏障：拉长对手CD，降低对手单位时间出手次数',
  '反物质等干扰：压制关键件，给我方叠层争取窗口',
  '目的不是“秒杀”，而是“让核心多动几次”',
]);

s = baseSlide();
addHeader(s, '5. 计算器实操流程（建议固定流程）');
bullets(s, [
  '1) 拖卡上场（先摆基础方案）',
  '2) 设定战斗时间或目标伤害',
  '3) 调整每张卡等级',
  '4) 点击“计算伤害”',
  '5) 查看推荐摆法并预览/应用',
  '6) 看折线与时间轴，定位触发断档点',
], 1.9, 21);

s = baseSlide();
addHeader(s, '6. 如何读结果（关键指标）');
bullets(s, [
  '总伤害：同时间窗口内最直接的强度指标',
  '出手次数：验证“左运转是否真的把核心和主C提速”',
  '折线形态：前期启动慢不慢、后期有没有滚起来',
  '调试明细：每0.5秒发生了什么、谁触发了谁',
]);

s = baseSlide();
addHeader(s, '7. 注意事项（必须讲清）');
bullets(s, [
  '这里只按“伤害最大化”推荐，不一定是实战最优',
  '实战常需要“牺牲一点伤害”换更多减速/控制频次',
  '游戏底层是 0.25s tick；工具是 0.5s 简化模拟，仅供决策参考',
], 2.0, 24);

s = baseSlide();
addHeader(s, '8. 直播可直接照读的话术');
bullets(s, [
  '“先让核心转起来，再谈输出，不要本末倒置。”',
  '“我们先跑基准摆法，再看推荐摆法，直接对比曲线。”',
  '“看到触发断档，就回去调整左侧运转和右侧收益排序。”',
  '“记住：可复现 > 玄学；稳定吃分比单局峰值更重要。”',
], 2.0, 22);

s = baseSlide();
addHeader(s, '9. 总结 + 行动清单');
bullets(s, [
  '✅ 固定三段式：左运转 / 中核心 / 右收益',
  '✅ 每次只改一个变量，用计算器验证',
  '✅ 用时间轴找问题：谁没吃到加成、谁触发断档',
  '✅ 先稳定再上限：先可复现，再追极限输出',
], 2.0, 24);

const out = '/Users/duang/Projects/bazaar_calculator/docs/dooley_数值核心教学.pptx';
await pptx.writeFile({ fileName: out });
console.log(out);
