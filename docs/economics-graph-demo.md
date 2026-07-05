# 经济学交互图像 Demo

> 使用方式：在博客后台新建一篇普通笔记，科目选择「经济学」，然后把本文整段复制进去。  
> 注意：`econgraph` 图像块只会在经济学笔记阅读页渲染成交互图；其他科目会保持普通代码块。

## 1. 需求与供给均衡

需求曲线 demand curve 和供给曲线 supply curve 的交点是均衡点。比较静态题里，先判断是哪一条曲线移动，再判断 equilibrium price 和 equilibrium quantity 怎么变。

```econgraph
{
  "template": "demand-supply",
  "title": "需求与供给的市场均衡",
  "focus": ["equilibrium"]
}
```

读图顺序：

- 纵轴是价格 P，横轴是数量 Q。
- D 向右下方倾斜，S 向右上方倾斜。
- 均衡点 E 决定 P* 和 Q*。

## 2. 垄断厂商 MR-MC 决策

垄断者面对向右下方倾斜的需求曲线，所以 marginal revenue 通常低于 price。利润最大化不是直接在需求曲线上找点，而是先看 MR 和 MC 的交点。

```econgraph
{
  "template": "monopoly-mr-mc",
  "title": "垄断厂商如何决定产量和价格",
  "focus": ["mr", "mc", "e-mr-mc"]
}
```

读图顺序：

- 第一步：MR = MC，决定利润最大化产量 Q*。
- 第二步：从 Q* 垂直到需求曲线，读出垄断价格 P*。
- 第三步：比较 P* 和 AC，判断是否存在经济利润。

## 3. 短期成本曲线

短期成本图里，MC、AC、AVC、AFC 这些名词很容易绕。核心关系其实很稳定：MC 穿过 AC 和 AVC 的最低点。

```econgraph
{
  "template": "cost-curves",
  "title": "短期成本曲线关系",
  "focus": ["mc", "min-ac", "min-avc"]
}
```

读图顺序：

- MC 低于 AC 时，AC 下降。
- MC 高于 AC 时，AC 上升。
- AVC 最低点和短期停产规则有关。

## 4. 复习提示

如果一张图看起来很复杂，可以按这个顺序拆：

1. 先确认坐标轴。
2. 再确认每条曲线的经济含义。
3. 再找交点、最低点、切点或投影。
4. 最后把图像语言翻译成考试表达。

比如垄断图像的考试表达可以写成：

> 垄断厂商按照 MR = MC 决定利润最大化产量 Q*，再根据需求曲线确定价格 P*。由于需求曲线向右下方倾斜，MR 位于需求曲线下方。当 P* 大于 Q* 处的 AC 时，厂商获得经济利润。
