export type StudySubjectId = "math" | "english" | "politics" | "professional";

export type BrushStage = "first" | "second" | "third" | "course";

export type StudyTimelineTask = {
  id: string;
  title: string;
  stage: BrushStage;
};

export type StudyTimelineMonth = {
  id: string;
  label: string;
  tasks: StudyTimelineTask[];
};

export type StudySubjectTimeline = {
  id: StudySubjectId;
  label: string;
  months: StudyTimelineMonth[];
};

export const studySubjectLabels: Record<StudySubjectId, string> = {
  math: "数学",
  english: "英语",
  politics: "政治",
  professional: "专业课",
};

export const brushStageLabels: Record<BrushStage, string> = {
  first: "一刷",
  second: "二刷",
  third: "三刷",
  course: "看课",
};

export const studyTimelines: StudySubjectTimeline[] = [
  {
    id: "math",
    label: studySubjectLabels.math,
    months: [
      {
        id: "math-07",
        label: "7月",
        tasks: [
          { id: "math-07-first-past-2007-2013", title: "2007-2013真题", stage: "first" },
          { id: "math-07-second-330", title: "330", stage: "second" },
          { id: "math-07-second-1000", title: "1000", stage: "second" },
          { id: "math-07-third-660", title: "660", stage: "third" },
        ],
      },
      {
        id: "math-08",
        label: "8月",
        tasks: [
          { id: "math-08-first-past-2014-2020", title: "2014-2020真题", stage: "first" },
          { id: "math-08-first-lilin-108", title: "李林108题", stage: "first" },
          { id: "math-08-second-lzy-135", title: "李正元135分", stage: "second" },
          { id: "math-08-third-330", title: "330", stage: "third" },
          { id: "math-08-third-1000", title: "1000", stage: "third" },
        ],
      },
      {
        id: "math-09",
        label: "9月",
        tasks: [
          { id: "math-09-first-past-2021-2026", title: "2021-2026真题", stage: "first" },
          { id: "math-09-first-lzy-predict", title: "李正元预测卷", stage: "first" },
          { id: "math-09-second-past-2007-2013", title: "2007-2013真题", stage: "second" },
          { id: "math-09-second-lilin-108", title: "李林108题", stage: "second" },
          { id: "math-09-third-lzy-135", title: "李正元135分", stage: "third" },
        ],
      },
      {
        id: "math-10",
        label: "10月",
        tasks: [
          { id: "math-10-first-lilin-2026-six", title: "2026李林六套卷", stage: "first" },
          { id: "math-10-first-lilin-2026-four", title: "2026李林四套卷", stage: "first" },
          { id: "math-10-first-jiang-150", title: "姜晓千150题", stage: "first" },
          { id: "math-10-second-past-2014-2020", title: "2014-2020真题", stage: "second" },
          { id: "math-10-second-lzy-predict", title: "李正元预测卷", stage: "second" },
        ],
      },
      {
        id: "math-11",
        label: "11月",
        tasks: [
          { id: "math-11-first-lilin-current-six", title: "今年李林六套卷", stage: "first" },
          { id: "math-11-first-hgd-chaoyue", title: "合工大超越卷", stage: "first" },
          { id: "math-11-second-past-2021-2026", title: "2021-2026真题", stage: "second" },
          { id: "math-11-second-jiang-150", title: "姜晓千150题", stage: "second" },
          { id: "math-11-third-past-2007-2013", title: "2007-2013真题", stage: "third" },
        ],
      },
      {
        id: "math-12",
        label: "12月",
        tasks: [
          { id: "math-12-first-lilin-current-four", title: "今年李林四套卷", stage: "first" },
          { id: "math-12-third-past-2014-2020", title: "2014-2020真题", stage: "third" },
          { id: "math-12-third-past-2021-2026", title: "2021-2026真题", stage: "third" },
        ],
      },
    ],
  },
  {
    id: "english",
    label: studySubjectLabels.english,
    months: [
      {
        id: "english-07",
        label: "7月",
        tasks: [
          { id: "english-07-first-reading-80", title: "阅读80篇", stage: "first" },
          { id: "english-07-course-reading-method", title: "阅读方法课", stage: "course" },
          { id: "english-07-course-long-sentence", title: "长难句基础课", stage: "course" },
        ],
      },
      {
        id: "english-08",
        label: "8月",
        tasks: [
          { id: "english-08-first-small-60", title: "三小门60篇", stage: "first" },
          { id: "english-08-second-reading-80", title: "阅读80篇", stage: "second" },
          { id: "english-08-course-reading-review", title: "阅读强化课", stage: "course" },
          { id: "english-08-course-new-type", title: "新题型方法课", stage: "course" },
          { id: "english-08-course-translation", title: "翻译方法课", stage: "course" },
        ],
      },
      {
        id: "english-09",
        label: "9月",
        tasks: [
          { id: "english-09-first-writing-40", title: "写作40篇", stage: "first" },
          { id: "english-09-second-small-60", title: "三小门60篇", stage: "second" },
          { id: "english-09-second-reading-80", title: "阅读80篇", stage: "second" },
          { id: "english-09-course-writing-basic", title: "写作基础课", stage: "course" },
          { id: "english-09-course-cloze", title: "完形方法课", stage: "course" },
        ],
      },
      {
        id: "english-10",
        label: "10月",
        tasks: [
          { id: "english-10-second-writing-40", title: "写作40篇", stage: "second" },
          { id: "english-10-third-small-60", title: "三小门60篇", stage: "third" },
          { id: "english-10-course-writing-advanced", title: "写作强化课", stage: "course" },
          { id: "english-10-course-writing-review", title: "写作批改课", stage: "course" },
        ],
      },
      {
        id: "english-11",
        label: "11月",
        tasks: [
          { id: "english-11-third-reading-80", title: "阅读80篇", stage: "third" },
          { id: "english-11-third-writing-40", title: "写作40篇", stage: "third" },
          { id: "english-11-course-writing-prediction", title: "写作押题课", stage: "course" },
          { id: "english-11-course-reading-review", title: "阅读错题课", stage: "course" },
        ],
      },
      {
        id: "english-12",
        label: "12月",
        tasks: [
          { id: "english-12-third-writing-memory", title: "写作背默", stage: "third" },
          { id: "english-12-third-reading-review", title: "阅读错题", stage: "third" },
          { id: "english-12-third-small-review", title: "三小门错题", stage: "third" },
          { id: "english-12-course-final-reminder", title: "考前提醒课", stage: "course" },
        ],
      },
    ],
  },
  {
    id: "politics",
    label: studySubjectLabels.politics,
    months: [
      {
        id: "politics-07",
        label: "7月",
        tasks: [
          { id: "politics-07-first-xiao1000-marx", title: "肖1000马原", stage: "first" },
          { id: "politics-07-course-marx", title: "马原强化", stage: "course" },
        ],
      },
      {
        id: "politics-08",
        label: "8月",
        tasks: [
          { id: "politics-08-first-xiao1000-history-mao", title: "肖1000史纲/毛中特", stage: "first" },
          { id: "politics-08-second-xiao1000-marx", title: "肖1000马原", stage: "second" },
          { id: "politics-08-course-history-mao", title: "史纲/毛中特强化", stage: "course" },
        ],
      },
      {
        id: "politics-09",
        label: "9月",
        tasks: [
          { id: "politics-09-first-xiao1000-morality-current", title: "肖1000思修/时政", stage: "first" },
          { id: "politics-09-second-xiao1000-history-mao", title: "肖1000史纲/毛中特", stage: "second" },
          { id: "politics-09-third-xiao1000-marx", title: "肖1000马原", stage: "third" },
          { id: "politics-09-course-choice", title: "选择题技巧", stage: "course" },
        ],
      },
      {
        id: "politics-10",
        label: "10月",
        tasks: [
          { id: "politics-10-second-xiao1000-morality-current", title: "肖1000思修/时政", stage: "second" },
          { id: "politics-10-third-xiao1000-marked", title: "肖1000标记题", stage: "third" },
          { id: "politics-10-course-current-choice", title: "时政/选择题技巧", stage: "course" },
        ],
      },
      {
        id: "politics-11",
        label: "11月",
        tasks: [
          { id: "politics-11-first-xiao8", title: "肖八", stage: "first" },
          { id: "politics-11-second-xiao1000-marked", title: "肖1000标记题", stage: "second" },
          { id: "politics-11-third-xiao8-choice", title: "肖八选择题", stage: "third" },
          { id: "politics-11-course-xiao8", title: "肖八解析", stage: "course" },
        ],
      },
      {
        id: "politics-12",
        label: "12月",
        tasks: [
          { id: "politics-12-first-xiao4", title: "肖四", stage: "first" },
          { id: "politics-12-third-xiao8-choice", title: "肖八选择题", stage: "third" },
          { id: "politics-12-third-xiao4-choice", title: "肖四选择题", stage: "third" },
          { id: "politics-12-course-xiao4-subjective", title: "肖四主观题", stage: "course" },
        ],
      },
    ],
  },
  {
    id: "professional",
    label: studySubjectLabels.professional,
    months: [
      {
        id: "professional-07",
        label: "7月",
        tasks: [
          { id: "professional-07-first-pindyck-micro-10-18", title: "平狄克微观10-18章", stage: "first" },
          { id: "professional-07-course-micro-basic", title: "微观基础课", stage: "course" },
        ],
      },
      {
        id: "professional-08",
        label: "8月",
        tasks: [
          { id: "professional-08-first-macro", title: "宏观一刷", stage: "first" },
          { id: "professional-08-second-pindyck-key", title: "平狄克重点章", stage: "second" },
          { id: "professional-08-course-macro-basic", title: "宏观基础课", stage: "course" },
        ],
      },
      {
        id: "professional-09",
        label: "9月",
        tasks: [
          { id: "professional-09-first-past-early", title: "专业课真题早年卷", stage: "first" },
          { id: "professional-09-second-micro-macro-key", title: "微宏重点章", stage: "second" },
          { id: "professional-09-course-topic", title: "微观计算/宏观专题", stage: "course" },
        ],
      },
      {
        id: "professional-10",
        label: "10月",
        tasks: [
          { id: "professional-10-first-past-recent", title: "专业课真题近年卷", stage: "first" },
          { id: "professional-10-second-past-topic", title: "真题高频专题", stage: "second" },
          { id: "professional-10-third-pindyck-marked", title: "平狄克标记题", stage: "third" },
          { id: "professional-10-course-answer-format", title: "答题规范课", stage: "course" },
        ],
      },
      {
        id: "professional-11",
        label: "11月",
        tasks: [
          { id: "professional-11-first-simulation", title: "专业课模拟题", stage: "first" },
          { id: "professional-11-second-past", title: "真题二刷", stage: "second" },
          { id: "professional-11-third-frequent-errors", title: "微宏高频错题", stage: "third" },
          { id: "professional-11-course-sprint", title: "冲刺课", stage: "course" },
        ],
      },
      {
        id: "professional-12",
        label: "12月",
        tasks: [
          { id: "professional-12-third-past-errors", title: "真题错题", stage: "third" },
          { id: "professional-12-third-answer-template", title: "答题模板", stage: "third" },
          { id: "professional-12-course-final-framework", title: "考前框架课", stage: "course" },
        ],
      },
    ],
  },
];
