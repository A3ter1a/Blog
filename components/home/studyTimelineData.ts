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
];
