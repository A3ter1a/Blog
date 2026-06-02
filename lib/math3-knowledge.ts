export type Math3KnowledgeAreaId = "calculus" | "linear-algebra" | "probability-statistics";
export type KnowledgeDifficulty = "basic" | "core" | "advanced";

export interface Math3KnowledgePoint {
  id: string;
  title: string;
  difficulty: KnowledgeDifficulty;
  tags: string[];
}

export interface Math3KnowledgeChapter {
  id: string;
  title: string;
  summary: string;
  points: Math3KnowledgePoint[];
}

export interface Math3KnowledgeArea {
  id: Math3KnowledgeAreaId;
  title: string;
  shortTitle: string;
  examWeight: string;
  description: string;
  chapters: Math3KnowledgeChapter[];
}

export const MATH3_KNOWLEDGE_SOURCE = "2025 年考研数学三大纲原文（完整版）";
export const MATH3_KNOWLEDGE_STAR_STORAGE_KEY = "math3-knowledge-starred-v1";
export const MATH3_KNOWLEDGE_MASTERED_STORAGE_KEY = "math3-knowledge-mastered-v1";
export const MATH3_KNOWLEDGE_COLLAPSED_CHAPTERS_STORAGE_KEY = "math3-knowledge-collapsed-chapters-v1";

export const difficultyMeta: Record<KnowledgeDifficulty, { label: string; tone: string }> = {
  basic: { label: "基础", tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" },
  core: { label: "核心", tone: "bg-amber-500/10 text-amber-700 border-amber-500/20" },
  advanced: { label: "综合", tone: "bg-rose-500/10 text-rose-700 border-rose-500/20" },
};

function point(id: string, title: string, difficulty: KnowledgeDifficulty, tags: string[] = []): Math3KnowledgePoint {
  return { id, title, difficulty, tags };
}

export const math3KnowledgeAreas: Math3KnowledgeArea[] = [
  {
    id: "calculus",
    title: "微积分",
    shortTitle: "微积分",
    examWeight: "60%",
    description: "按附件中的高等数学部分整理，覆盖极限、微分、积分、多元函数、级数、微分方程与差分方程。",
    chapters: [
      {
        id: "calculus-functions-limits-continuity",
        title: "一、函数、极限、连续",
        summary: "函数性质、极限计算、无穷小比较和连续函数性质，是整套微积分内容的入口。",
        points: [
          point("calc-1-01", "函数的概念及表示法", "basic", ["函数"]),
          point("calc-1-02", "函数的有界性、单调性、周期性和奇偶性", "basic", ["函数性质"]),
          point("calc-1-03", "复合函数、反函数、分段函数和隐函数", "core", ["函数"]),
          point("calc-1-04", "基本初等函数的性质及其图形", "basic", ["初等函数"]),
          point("calc-1-05", "初等函数的概念", "basic", ["初等函数"]),
          point("calc-1-06", "函数关系的建立", "core", ["应用"]),
          point("calc-1-07", "数列极限与函数极限的定义及性质", "basic", ["极限"]),
          point("calc-1-08", "函数左极限、右极限及极限存在关系", "core", ["极限"]),
          point("calc-1-09", "无穷小量和无穷大量的概念及关系", "basic", ["无穷小"]),
          point("calc-1-10", "无穷小量的性质、比较和等价无穷小", "core", ["无穷小"]),
          point("calc-1-11", "极限的四则运算法则", "basic", ["极限"]),
          point("calc-1-12", "极限存在准则：单调有界准则和夹逼准则", "core", ["极限"]),
          point("calc-1-13", "两个重要极限", "core", ["极限"]),
          point("calc-1-14", "函数连续的概念（含左连续与右连续）", "basic", ["连续"]),
          point("calc-1-15", "函数间断点的类型判别", "core", ["连续"]),
          point("calc-1-16", "初等函数的连续性", "basic", ["连续"]),
          point("calc-1-17", "闭区间连续函数的有界性、最大值和最小值定理", "core", ["连续"]),
          point("calc-1-18", "闭区间连续函数的介值定理及应用", "core", ["连续"]),
        ],
      },
      {
        id: "calculus-single-variable-differential",
        title: "二、一元函数微分学",
        summary: "围绕导数、微分、中值定理、洛必达法则和函数性态分析展开，是计算与证明题高频区。",
        points: [
          point("calc-2-01", "导数和微分的概念", "basic", ["导数"]),
          point("calc-2-02", "导数的几何意义和经济意义（边际与弹性）", "core", ["导数", "经济应用"]),
          point("calc-2-03", "函数可导性与连续性之间的关系", "core", ["概念"]),
          point("calc-2-04", "平面曲线的切线方程和法线方程", "core", ["应用"]),
          point("calc-2-05", "导数和微分的四则运算", "basic", ["求导"]),
          point("calc-2-06", "基本初等函数的导数公式", "basic", ["公式"]),
          point("calc-2-07", "复合函数、反函数和隐函数的微分法", "core", ["求导"]),
          point("calc-2-08", "分段函数的导数", "core", ["求导"]),
          point("calc-2-09", "高阶导数", "core", ["导数"]),
          point("calc-2-10", "一阶微分形式的不变性", "basic", ["微分"]),
          point("calc-2-11", "罗尔定理、拉格朗日中值定理和柯西中值定理", "advanced", ["中值定理"]),
          point("calc-2-12", "泰勒定理", "advanced", ["展开"]),
          point("calc-2-13", "洛必达法则求未定式极限", "core", ["极限"]),
          point("calc-2-14", "函数单调性的判别方法", "core", ["性态"]),
          point("calc-2-15", "函数极值、最大值、最小值的求法及应用", "core", ["性态"]),
          point("calc-2-16", "函数图形的凹凸性和拐点", "core", ["图形"]),
          point("calc-2-17", "水平、铅直和斜渐近线", "core", ["图形"]),
          point("calc-2-18", "函数图形的描绘", "advanced", ["图形"]),
        ],
      },
      {
        id: "calculus-single-variable-integral",
        title: "三、一元函数积分学",
        summary: "覆盖不定积分、定积分、反常积分和定积分应用，重点是稳定计算和应用建模。",
        points: [
          point("calc-3-01", "原函数与不定积分的概念", "basic", ["不定积分"]),
          point("calc-3-02", "不定积分的基本性质和基本积分公式", "basic", ["公式"]),
          point("calc-3-03", "不定积分的换元积分法和分部积分法", "core", ["方法"]),
          point("calc-3-04", "定积分的概念和基本性质", "basic", ["定积分"]),
          point("calc-3-05", "定积分中值定理", "core", ["定积分"]),
          point("calc-3-06", "积分上限的函数及其导数", "core", ["定积分"]),
          point("calc-3-07", "牛顿-莱布尼茨公式", "basic", ["定积分"]),
          point("calc-3-08", "定积分的换元积分法和分部积分法", "core", ["方法"]),
          point("calc-3-09", "利用定积分计算平面图形面积", "core", ["应用"]),
          point("calc-3-10", "利用定积分计算旋转体体积", "advanced", ["应用"]),
          point("calc-3-11", "利用定积分计算函数平均值", "core", ["应用"]),
          point("calc-3-12", "定积分求解简单经济应用问题", "advanced", ["经济应用"]),
          point("calc-3-13", "反常积分的概念", "basic", ["反常积分"]),
          point("calc-3-14", "反常积分收敛的比较判别法和计算", "advanced", ["反常积分"]),
        ],
      },
      {
        id: "calculus-multivariable",
        title: "四、多元函数微积分学",
        summary: "重点是多元函数偏导、全微分、极值、条件极值和二重积分计算。",
        points: [
          point("calc-4-01", "多元函数的概念与二元函数的几何意义", "basic", ["多元函数"]),
          point("calc-4-02", "二元函数的极限与连续", "core", ["连续"]),
          point("calc-4-03", "有界闭区域上二元连续函数的性质", "core", ["连续"]),
          point("calc-4-04", "多元函数偏导数与全微分的概念", "basic", ["偏导", "全微分"]),
          point("calc-4-05", "多元复合函数一阶、二阶偏导数", "core", ["求导"]),
          point("calc-4-06", "隐函数存在定理与多元隐函数偏导数", "advanced", ["求导"]),
          point("calc-4-07", "二阶偏导数", "core", ["偏导"]),
          point("calc-4-08", "多元函数极值和条件极值的概念", "core", ["极值"]),
          point("calc-4-09", "多元函数极值存在的必要条件和充分条件", "advanced", ["极值"]),
          point("calc-4-10", "拉格朗日乘数法求条件极值", "advanced", ["极值"]),
          point("calc-4-11", "简单多元函数最大值、最小值及应用", "advanced", ["应用"]),
          point("calc-4-12", "二重积分的概念、基本性质和中值定理", "basic", ["二重积分"]),
          point("calc-4-13", "二重积分计算方法：直角坐标和极坐标", "core", ["二重积分"]),
          point("calc-4-14", "无界区域上较简单的反常二重积分", "advanced", ["反常积分"]),
        ],
      },
      {
        id: "calculus-series",
        title: "五、无穷级数",
        summary: "常数项级数、正项级数判敛、任意项级数和幂级数展开是本章主线。",
        points: [
          point("calc-5-01", "常数项级数的收敛、发散与收敛级数的和", "basic", ["级数"]),
          point("calc-5-02", "级数的基本性质与收敛必要条件", "basic", ["级数"]),
          point("calc-5-03", "几何级数与 p 级数的收敛性", "core", ["级数"]),
          point("calc-5-04", "正项级数比较判别法", "core", ["判敛"]),
          point("calc-5-05", "正项级数比值判别法", "core", ["判敛"]),
          point("calc-5-06", "正项级数根值判别法", "advanced", ["判敛"]),
          point("calc-5-07", "正项级数积分判别法", "advanced", ["判敛"]),
          point("calc-5-08", "交错级数与莱布尼茨判别法", "core", ["判敛"]),
          point("calc-5-09", "任意项级数的绝对收敛与条件收敛", "core", ["判敛"]),
          point("calc-5-10", "幂级数及其收敛半径", "core", ["幂级数"]),
          point("calc-5-11", "幂级数的收敛区间和收敛域", "core", ["幂级数"]),
          point("calc-5-12", "幂级数的和函数", "advanced", ["幂级数"]),
          point("calc-5-13", "幂级数在收敛区间内的连续性、逐项求导和逐项积分", "advanced", ["幂级数"]),
          point("calc-5-14", "简单幂级数和函数求法及数项级数求和", "advanced", ["幂级数"]),
          point("calc-5-15", "初等函数的麦克劳林展开式", "core", ["展开"]),
        ],
      },
      {
        id: "calculus-differential-difference-equations",
        title: "六、常微分方程与差分方程",
        summary: "数三特色章节，重点是常微分方程求解、差分方程概念和简单经济应用。",
        points: [
          point("calc-6-01", "微分方程的阶、解、通解、初始条件和特解", "basic", ["概念"]),
          point("calc-6-02", "变量可分离的微分方程", "core", ["一阶方程"]),
          point("calc-6-03", "齐次微分方程", "core", ["一阶方程"]),
          point("calc-6-04", "一阶线性微分方程", "core", ["一阶方程"]),
          point("calc-6-05", "线性微分方程解的性质及解的结构", "advanced", ["方程结构"]),
          point("calc-6-06", "二阶常系数齐次线性微分方程", "core", ["二阶方程"]),
          point("calc-6-07", "高于二阶的常系数齐次线性微分方程", "advanced", ["高阶方程"]),
          point("calc-6-08", "二阶常系数非齐次线性微分方程", "advanced", ["二阶方程"]),
          point("calc-6-09", "差分与差分方程的概念", "basic", ["差分方程"]),
          point("calc-6-10", "差分方程的通解与特解", "core", ["差分方程"]),
          point("calc-6-11", "一阶常系数线性差分方程", "core", ["差分方程"]),
          point("calc-6-12", "微分方程求解简单经济应用问题", "advanced", ["经济应用"]),
        ],
      },
    ],
  },
  {
    id: "linear-algebra",
    title: "线性代数",
    shortTitle: "线代",
    examWeight: "20%",
    description: "按附件中的线性代数部分整理，覆盖行列式、矩阵、向量、线性方程组、特征值与二次型。",
    chapters: [
      {
        id: "linear-determinants",
        title: "一、行列式",
        summary: "本章内容短，但行列式性质和展开定理是矩阵与方程组计算的基础。",
        points: [
          point("linear-1-01", "行列式的概念", "basic", ["行列式"]),
          point("linear-1-02", "行列式的基本性质", "basic", ["行列式"]),
          point("linear-1-03", "行列式按行（列）展开定理", "core", ["计算"]),
          point("linear-1-04", "应用性质和展开定理计算行列式", "core", ["计算"]),
        ],
      },
      {
        id: "linear-matrices",
        title: "二、矩阵",
        summary: "矩阵运算、逆矩阵、初等变换、秩和分块矩阵是线代后续章节的共同工具。",
        points: [
          point("linear-2-01", "矩阵的概念", "basic", ["矩阵"]),
          point("linear-2-02", "单位矩阵、数量矩阵、对角矩阵和三角矩阵", "basic", ["特殊矩阵"]),
          point("linear-2-03", "对称矩阵、反对称矩阵和正交矩阵", "core", ["特殊矩阵"]),
          point("linear-2-04", "矩阵的线性运算", "basic", ["运算"]),
          point("linear-2-05", "矩阵乘法及其运算规律", "core", ["运算"]),
          point("linear-2-06", "方阵的幂", "core", ["运算"]),
          point("linear-2-07", "方阵乘积的行列式", "core", ["行列式"]),
          point("linear-2-08", "矩阵的转置", "basic", ["矩阵"]),
          point("linear-2-09", "逆矩阵的概念、性质和可逆充分必要条件", "core", ["逆矩阵"]),
          point("linear-2-10", "伴随矩阵及用伴随矩阵求逆矩阵", "core", ["逆矩阵"]),
          point("linear-2-11", "矩阵的初等变换和初等矩阵", "core", ["初等变换"]),
          point("linear-2-12", "矩阵等价", "core", ["初等变换"]),
          point("linear-2-13", "矩阵的秩及用初等变换求秩", "core", ["秩"]),
          point("linear-2-14", "分块矩阵及其运算", "advanced", ["矩阵"]),
        ],
      },
      {
        id: "linear-vectors",
        title: "三、向量",
        summary: "向量组的线性相关性、极大无关组、秩和正交规范化是解空间理解的关键。",
        points: [
          point("linear-3-01", "向量的概念、加法和数乘运算", "basic", ["向量"]),
          point("linear-3-02", "向量的线性组合与线性表示", "core", ["向量组"]),
          point("linear-3-03", "向量组线性相关与线性无关的概念", "core", ["向量组"]),
          point("linear-3-04", "线性相关、线性无关的性质及判别法", "core", ["向量组"]),
          point("linear-3-05", "向量组的极大线性无关组", "core", ["向量组"]),
          point("linear-3-06", "向量组的秩", "core", ["秩"]),
          point("linear-3-07", "等价向量组", "advanced", ["向量组"]),
          point("linear-3-08", "向量组的秩与矩阵行（列）向量组的秩", "advanced", ["秩"]),
          point("linear-3-09", "向量内积", "basic", ["正交"]),
          point("linear-3-10", "施密特正交规范化方法", "advanced", ["正交"]),
        ],
      },
      {
        id: "linear-equations",
        title: "四、线性方程组",
        summary: "重点是用秩和初等行变换判断解的存在性，并写出齐次与非齐次通解。",
        points: [
          point("linear-4-01", "克拉默法则", "core", ["方程组"]),
          point("linear-4-02", "齐次线性方程组有非零解的充分必要条件", "core", ["方程组"]),
          point("linear-4-03", "非齐次线性方程组有解和无解的判定方法", "core", ["方程组"]),
          point("linear-4-04", "线性方程组解的性质和解的结构", "core", ["解结构"]),
          point("linear-4-05", "齐次线性方程组的基础解系", "core", ["解结构"]),
          point("linear-4-06", "齐次线性方程组的通解", "core", ["解结构"]),
          point("linear-4-07", "非齐次线性方程组的通解", "advanced", ["解结构"]),
          point("linear-4-08", "用初等行变换求解线性方程组", "advanced", ["计算"]),
        ],
      },
      {
        id: "linear-eigen",
        title: "五、矩阵的特征值和特征向量",
        summary: "特征值、特征向量、相似矩阵和实对称矩阵对角化，是后续二次型的重要基础。",
        points: [
          point("linear-5-01", "矩阵特征值和特征向量的概念", "basic", ["特征值"]),
          point("linear-5-02", "矩阵特征值的性质", "core", ["特征值"]),
          point("linear-5-03", "求矩阵特征值和特征向量的方法", "core", ["计算"]),
          point("linear-5-04", "相似变换和相似矩阵的概念及性质", "core", ["相似"]),
          point("linear-5-05", "矩阵可相似对角化的充分必要条件", "advanced", ["对角化"]),
          point("linear-5-06", "将矩阵化为相似对角矩阵的方法", "advanced", ["对角化"]),
          point("linear-5-07", "实对称矩阵的特征值和特征向量性质", "core", ["实对称"]),
          point("linear-5-08", "实对称矩阵的相似对角矩阵", "advanced", ["实对称"]),
        ],
      },
      {
        id: "linear-quadratic-forms",
        title: "六、二次型",
        summary: "二次型与合同变换、标准形、规范形、惯性定理和正定判别紧密相连。",
        points: [
          point("linear-6-01", "二次型及其矩阵表示", "basic", ["二次型"]),
          point("linear-6-02", "合同变换与合同矩阵", "core", ["合同"]),
          point("linear-6-03", "二次型的秩", "core", ["秩"]),
          point("linear-6-04", "惯性定理", "advanced", ["综合"]),
          point("linear-6-05", "二次型的标准形和规范形", "core", ["标准形"]),
          point("linear-6-06", "用正交变换化二次型为标准形", "advanced", ["标准形"]),
          point("linear-6-07", "用配方法化二次型为标准形", "core", ["标准形"]),
          point("linear-6-08", "正定二次型和正定矩阵的概念", "advanced", ["正定"]),
          point("linear-6-09", "正定二次型和正定矩阵的判别法", "advanced", ["正定"]),
        ],
      },
    ],
  },
  {
    id: "probability-statistics",
    title: "概率论与数理统计",
    shortTitle: "概率统计",
    examWeight: "20%",
    description: "按附件中的概率统计部分整理，覆盖随机事件、随机变量、数字特征、极限定理、统计量和参数估计。",
    chapters: [
      {
        id: "prob-events-probability",
        title: "一、随机事件和概率",
        summary: "概率基本公式、事件独立性和独立重复试验是本章最核心的计算工具。",
        points: [
          point("prob-1-01", "样本空间和随机事件", "basic", ["事件"]),
          point("prob-1-02", "事件的关系与运算", "basic", ["事件"]),
          point("prob-1-03", "完备事件组", "core", ["事件"]),
          point("prob-1-04", "概率的概念和基本性质", "basic", ["概率"]),
          point("prob-1-05", "古典型概率", "core", ["概型"]),
          point("prob-1-06", "几何型概率", "core", ["概型"]),
          point("prob-1-07", "条件概率", "core", ["公式"]),
          point("prob-1-08", "概率加法、减法、乘法、全概率和贝叶斯公式", "advanced", ["公式"]),
          point("prob-1-09", "事件独立性及概率计算", "core", ["独立性"]),
          point("prob-1-10", "独立重复试验", "core", ["概型"]),
        ],
      },
      {
        id: "prob-random-variable",
        title: "二、随机变量及其分布",
        summary: "从分布函数、分布律和概率密度出发，掌握常见分布及随机变量函数分布。",
        points: [
          point("prob-2-01", "随机变量的概念", "basic", ["随机变量"]),
          point("prob-2-02", "随机变量分布函数的概念及性质", "core", ["分布"]),
          point("prob-2-03", "离散型随机变量的概率分布", "basic", ["离散"]),
          point("prob-2-04", "连续型随机变量的概率密度", "basic", ["连续"]),
          point("prob-2-05", "0-1 分布", "core", ["常见分布"]),
          point("prob-2-06", "二项分布", "core", ["常见分布"]),
          point("prob-2-07", "几何分布", "core", ["常见分布"]),
          point("prob-2-08", "超几何分布", "advanced", ["常见分布"]),
          point("prob-2-09", "泊松分布及其应用", "core", ["常见分布"]),
          point("prob-2-10", "泊松定理和二项分布近似", "advanced", ["近似"]),
          point("prob-2-11", "均匀分布", "core", ["常见分布"]),
          point("prob-2-12", "正态分布", "core", ["常见分布"]),
          point("prob-2-13", "指数分布", "core", ["常见分布"]),
          point("prob-2-14", "随机变量函数的分布", "advanced", ["函数分布"]),
        ],
      },
      {
        id: "prob-multidimensional",
        title: "三、多维随机变量及其分布",
        summary: "联合分布、边缘分布、条件分布、独立性和函数分布是多维随机变量的主线。",
        points: [
          point("prob-3-01", "多维随机变量分布函数的概念和基本性质", "basic", ["联合分布"]),
          point("prob-3-02", "二维离散型随机变量的概率分布", "core", ["离散"]),
          point("prob-3-03", "二维连续型随机变量的概率密度", "core", ["连续"]),
          point("prob-3-04", "边缘分布和边缘概率密度", "core", ["边缘"]),
          point("prob-3-05", "条件分布和条件密度", "advanced", ["条件"]),
          point("prob-3-06", "随机变量的独立性", "core", ["独立性"]),
          point("prob-3-07", "随机变量的不相关性", "core", ["相关"]),
          point("prob-3-08", "随机变量不相关性与独立性的关系", "advanced", ["综合"]),
          point("prob-3-09", "二维均匀分布", "core", ["常见分布"]),
          point("prob-3-10", "二维正态分布及参数的概率意义", "advanced", ["常见分布"]),
          point("prob-3-11", "两个随机变量函数的分布", "advanced", ["函数分布"]),
          point("prob-3-12", "多个相互独立随机变量函数的分布", "advanced", ["函数分布"]),
        ],
      },
      {
        id: "prob-numerical-characteristics",
        title: "四、随机变量的数字特征",
        summary: "数学期望、方差、矩、协方差和相关系数，是概率计算与统计推断的基础语言。",
        points: [
          point("prob-4-01", "随机变量的数学期望", "basic", ["期望"]),
          point("prob-4-02", "随机变量的方差和标准差", "basic", ["方差"]),
          point("prob-4-03", "随机变量数字特征的基本性质", "core", ["性质"]),
          point("prob-4-04", "常用分布的数字特征", "core", ["常见分布"]),
          point("prob-4-05", "随机变量函数的数学期望", "core", ["期望"]),
          point("prob-4-06", "切比雪夫不等式", "core", ["不等式"]),
          point("prob-4-07", "矩", "core", ["矩"]),
          point("prob-4-08", "协方差", "core", ["协方差"]),
          point("prob-4-09", "相关系数及其性质", "core", ["相关"]),
        ],
      },
      {
        id: "prob-limit-theorems",
        title: "五、大数定律和中心极限定理",
        summary: "本章重点在了解定理条件，并用相关定理做概率近似计算。",
        points: [
          point("prob-5-01", "切比雪夫大数定律", "core", ["大数定律"]),
          point("prob-5-02", "伯努利大数定律", "basic", ["大数定律"]),
          point("prob-5-03", "辛钦大数定律", "core", ["大数定律"]),
          point("prob-5-04", "棣莫弗-拉普拉斯中心极限定理", "advanced", ["中心极限定理"]),
          point("prob-5-05", "列维-林德伯格中心极限定理", "advanced", ["中心极限定理"]),
          point("prob-5-06", "用大数定律和中心极限定理近似计算概率", "advanced", ["近似"]),
        ],
      },
      {
        id: "prob-statistics-basics",
        title: "六、数理统计的基本概念",
        summary: "总体、样本、统计量、经验分布函数和三大抽样分布，是参数估计前置内容。",
        points: [
          point("prob-6-01", "总体和个体", "basic", ["样本"]),
          point("prob-6-02", "简单随机样本", "basic", ["样本"]),
          point("prob-6-03", "统计量", "basic", ["统计量"]),
          point("prob-6-04", "经验分布函数", "advanced", ["统计量"]),
          point("prob-6-05", "样本均值", "basic", ["统计量"]),
          point("prob-6-06", "样本方差", "core", ["统计量"]),
          point("prob-6-07", "样本矩", "core", ["统计量"]),
          point("prob-6-08", "卡方分布及卡方变量产生模式", "core", ["抽样分布"]),
          point("prob-6-09", "t 分布及 t 变量产生模式", "core", ["抽样分布"]),
          point("prob-6-10", "F 分布及 F 变量产生模式", "core", ["抽样分布"]),
          point("prob-6-11", "标准正态、卡方、t、F 分布的上侧分位数", "advanced", ["抽样分布"]),
          point("prob-6-12", "正态总体样本均值、样本方差和样本矩的抽样分布", "advanced", ["抽样分布"]),
        ],
      },
      {
        id: "prob-parameter-estimation",
        title: "七、参数估计",
        summary: "参数估计是统计部分收束章节，核心是点估计、矩估计法和最大似然估计法。",
        points: [
          point("prob-7-01", "点估计的概念", "basic", ["参数估计"]),
          point("prob-7-02", "估计量与估计值", "basic", ["参数估计"]),
          point("prob-7-03", "矩估计法（一阶矩、二阶矩）", "core", ["方法"]),
          point("prob-7-04", "最大似然估计法", "advanced", ["方法"]),
        ],
      },
    ],
  },
];

export const math3KnowledgeTotals = math3KnowledgeAreas.reduce(
  (totals, area) => {
    totals.chapters += area.chapters.length;
    totals.points += area.chapters.reduce((sum, chapter) => sum + chapter.points.length, 0);
    return totals;
  },
  { chapters: 0, points: 0 }
);

export const math3KnowledgePointIds = math3KnowledgeAreas.flatMap((area) =>
  area.chapters.flatMap((chapter) => chapter.points.map((pointItem) => pointItem.id))
);

export const math3KnowledgeChapterIds = math3KnowledgeAreas.flatMap((area) =>
  area.chapters.map((chapter) => chapter.id)
);
