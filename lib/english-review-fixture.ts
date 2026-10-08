import {
  ENGLISH_ORDERING_ANSWER_POSITIONS,
} from "@/lib/english-training";
import type {
  EnglishPassage,
  EnglishQuestion,
  EnglishTrainingData,
} from "@/lib/english-training";

const reviewDate = new Date("2026-01-01T00:00:00.000Z");

function passage(
  id: string,
  section: EnglishPassage["section"],
  passageNo: EnglishPassage["passageNo"],
  title: string,
  content: string,
  totalScore: number,
  sortOrder: number,
): EnglishPassage {
  return {
    id,
    paperId: "review-paper-2026",
    year: 2026,
    section,
    passageNo,
    title,
    content,
    totalScore,
    sortOrder,
    createdAt: reviewDate,
    updatedAt: reviewDate,
  };
}

function question(
  id: string,
  passageId: string,
  questionNo: string,
  stem: string,
  standardAnswer: string,
  sortOrder: number,
  options: EnglishQuestion["options"] = [],
  score = 2,
): EnglishQuestion {
  return {
    id,
    passageId,
    questionNo,
    stem,
    options: options.length > 0 ? options : [
      { label: "A", content: "It reduces the need for careful planning." },
      { label: "B", content: "It helps people notice how small choices accumulate." },
      { label: "C", content: "It makes every decision equally important." },
      { label: "D", content: "It replaces reflection with fixed rules." },
    ],
    standardAnswer,
    score,
    sortOrder,
    createdAt: reviewDate,
    updatedAt: reviewDate,
  };
}

function choices(...contents: string[]): EnglishQuestion["options"] {
  return contents.map((content, index) => ({
    label: String.fromCharCode(65 + index),
    content,
  }));
}

function subjectiveQuestion(
  id: string,
  passageId: string,
  questionNo: string,
  stem: string,
  score: number,
  sortOrder: number,
): EnglishQuestion {
  return {
    id,
    passageId,
    questionNo,
    stem,
    options: [],
    standardAnswer: "",
    score,
    sortOrder,
    createdAt: reviewDate,
    updatedAt: reviewDate,
  };
}

export function getEnglishReviewFixture(): EnglishTrainingData {
  const readingId = "review-passage-reading-2026";
  const clozeId = "review-passage-cloze-2026";
  const insertionId = "review-passage-new-type-insertion-2026";
  const orderingId = "review-passage-new-type-ordering-2026";
  const headingId = "review-passage-new-type-heading-2026";
  const translationId = "review-passage-translation-2026";
  const smallWritingId = "review-passage-writing-2026";
  const bigWritingId = "review-passage-writing-big-2026";
  const readingText1 = [
    "P1 For thousands of years, donkeys have been critical for propelling human civilizations forward. They've helped pull wheeled vehicles, carry travelers and move goods across the world. But where and when these animals first became intertwined with humans has been a mystery. Now, researchers have used genomes of over 200 donkeys to trace their domestication back to a single event around 7,000 years ago in East Africa — about 3,000 years before humans tamed horses. The team published their findings in the journal Science this month.",
    "P2 \"Through their DNA, the animals are telling their history themselves,\" co-author Samantha Brooks, an equine researcher at the University of Florida, says in a statement. \"We usually only get the human's side of history through written accounts, but of course written history does not always record exactly how something happened. Looking at these DNA sequences, we get a biological testimony to the environment these animals lived in and the experiences they survived.\"",
    "P3 The researchers examined 207 genomes from modern donkeys living in 31 countries across the globe. They also looked at genomes from 15 wild equids and 31 earlier donkeys that lived between about 4,000 and 100 years ago. The team reconstructed the animals' evolutionary tree and used computer models to pinpoint the domestication event when herders in Kenya and the Horn of Africa tamed wild asses. They then traced how the animals spread across the rest of the continent into Europe and Asia about 2,500 years later.",
    "P4 Though it's still unclear why the original domestication happened, Science News' Freda Kreier reports that the event coincided with the Sahara growing larger and drier. \"Donkeys are champions when it comes to carrying stuff and are good at crossing deserts,\" co-author Ludovic Orlando, an evolutionary biologist at Paul Sabatier University in France, tells the publication. Prehistoric humans may have tamed donkeys to help navigate the expanding Sahara.",
    "P5 Researchers say these findings could help put donkeys in the spotlight. The animals could benefit from more research: Currently, there are no published genomes from donkeys located south of the Equator in Africa. But understanding where the animals were first domesticated could guide archaeologists to a narrow region to search for insights about the original tamed donkeys.",
    "P6 Not only does understanding the equines' genetic makeup help reveal their contribution to human history, but it also might improve their management in the future, as climate change alters the planet's environment, write the authors.",
  ].join("\n\n");
  const clozeText = [
    "Advances in artificial intelligence (AI) are rapidly changing every aspect of human life. The world of AI is buzzing with an exciting potential to improve and enrich our lives. (1), AI also has the potential hazard of (2) our experiences in ways we might find difficult to control. One such (3) is how we understand and experience beauty.",
    "AI can be a collaborative tool in a wide range of creative endeavors. (4) human creativity and AI algorithms can lead to unique artistic (5) that are beautiful to the human eye. These collaborations are likely to become increasingly common. (6), AI enables virtual try-on experiences where you can virtually (7) makeup, hairstyles, clothing, and even cosmetic procedures (8) making any physical changes. Individuals can now experiment with different looks and (9) their preferences, potentially expanding the range of beauty ideals.",
    "AI algorithms can (10) facial features and skin conditions to provide personalized beauty recommendations. This (11) approach aims to cater to individual preferences and enhance the concept of beauty tailored to each person's unique characteristics. (12), AI can be a fun vehicle for self-discovery.",
    "While AI offers exciting possibilities, it also raises ethical (13). There is a risk of deepening societal beauty (14) and perpetuating unattainable beauty standards. (15), AI-powered beauty filters and editing tools can lead to distorted self-perception and (16) body dissatisfaction. As summarized in a recent post on \"The Hidden Dangers of Online Beauty Filters\", (17) on this technology for social presentation can cause harm (18) body image issues, lower self-esteem, and social anxiety.",
    "It's important to note that while AI can enhance our (19) of beauty, it should not (20) the genuine human experience and the emotional connections we derive from seeing the beauty in each other.",
  ].join("\n\n");
  const insertionText = [
    "For questions 11-15, choose the most suitable sentence from the seven choices A-G to fill each numbered blank in the passage. There are two extra choices. (10 points)",
    "A useful study record does more than store a final answer. It should preserve the small decisions that made the answer possible. (11) A learner can then return to the exact moment when a new idea became clear.",
    "The record also creates a bridge between separate study sessions. (12) This makes review feel like a continuation rather than a restart.",
    "Good notes do not need to be long. (13) They need to keep the evidence that will help the learner choose the next step.",
    "When a mistake is recorded with its cause, correction becomes more specific. (14) A vague feeling of failure can then become a question that can be tested.",
    "Over time, this practice builds a map of changing habits. (15) The map only needs to be clear enough to guide the next attempt.",
  ].join("\n\n");
  const orderingText = [
    "For questions 11-15, the following eight paragraphs have been mixed up. Three paragraph positions are already given. Choose the most suitable paragraph for each remaining position. (10 points)",
    "A. Libraries have responded by turning their buildings into flexible learning spaces.",
    "B. A strong library combines access to information with opportunities for conversation.",
    "C. The result is a public institution that supports both independent study and shared life.",
    "D. The discussion begins with the people who use the library.",
    "E. The challenge is to keep the service open to people with different needs.",
    "F. For this reason, a library's value cannot be measured only by the number of books on its shelves.",
    "G. Its future depends on treating technology as a tool rather than a replacement for trust.",
    "H. That change makes the institution useful beyond the traditional book collection.",
  ].join("\n\n");
  const headingText = [
    "For questions 11-15, choose the most suitable heading from the seven choices A-G for each numbered paragraph. There are two extra headings. (10 points)",
    "Paragraph 1. A library is no longer only a place to borrow printed books. It is also a quiet space where people can learn together and use tools they may not have at home.",
    "Paragraph 2. Digital collections have made research faster, but readers still need guidance to judge which sources deserve their trust.",
    "Paragraph 3. Many libraries now host workshops that connect local knowledge with practical skills, from repairing objects to learning a language.",
    "Paragraph 4. The most valuable service may be the sense of belonging created when different generations share one public space.",
    "Paragraph 5. These changes do not replace the traditional library; they show how its purpose can grow with the community.",
  ].join("\n\n");
  const insertionChoices = choices(
    "This is why a record should show the path, not only the destination.",
    "The best records are therefore short, precise, and easy to revisit.",
    "That connection is especially important after a difficult exercise.",
    "A clear cause makes the next correction much easier to plan.",
    "In this way, the learner can compare one decision with another.",
    "The purpose is not to describe every minute of a study day.",
    "A record can also be shared with a teacher or study partner.",
  );
  const orderingNumberOptions: EnglishQuestion["options"] = Array.from({ length: 8 }, (_, index) => ({
    label: String(index + 1),
    content: `第 ${index + 1} 段`,
  }));
  const headingChoices = choices(
    "A broader role for a familiar institution",
    "Learning to judge digital information",
    "Practical knowledge moves into the library",
    "A shared place for different generations",
    "Change without losing the original purpose",
    "Why printed books still matter most",
    "A service built around private membership",
  );
  const bigWritingPrompt = [
    "Write an essay based on the charts below. In your essay, you should:\n\n1. describe the charts briefly;\n2. interpret the charts; and\n3. give your comments.\n\nWrite your answer in 160-200 words on the ANSWER SHEET. (20 points)",
    "![Consumer acceptance of elderly-care robots and primary concerns](/english-review-writing-chart.svg?v=2)",
    "| 指标 | 项目 | 占比 |\n| --- | --- | ---: |\n| 接受程度 | 完全接受 | 39.3% |\n| 接受程度 | 部分接受 | 32.8% |\n| 接受程度 | 不接受 | 27.9% |\n| 首要关注点 | 安全 | 46.3% |\n| 首要关注点 | 价格 | 24.9% |\n| 首要关注点 | 便利 | 10.7% |",
  ].join("\n\n");

  return {
    papers: [{
      id: "review-paper-2026",
      year: 2026,
      paperType: "english1",
      title: "英语一 2026（审查题组）",
      totalScore: 100,
      createdAt: reviewDate,
      updatedAt: reviewDate,
    }],
    passages: [
      passage(
        readingId,
        "reading",
        "text1",
        "Reading Text 1 · Donkey domestication",
        readingText1,
        10,
        1,
      ),
      passage(
        clozeId,
        "cloze",
        "cloze",
        "Cloze Practice · AI and beauty",
        clozeText,
        10,
        2,
      ),
      passage(
        insertionId,
        "new_type",
        "new_type",
        "2026 新题型 · 七选五模板",
        insertionText,
        10,
        3,
      ),
      passage(
        orderingId,
        "new_type",
        "new_type",
        "2026 新题型 · 段落排序模板",
        orderingText,
        10,
        4,
      ),
      passage(
        headingId,
        "new_type",
        "new_type",
        "2026 新题型 · 小标题模板",
        headingText,
        10,
        5,
      ),
      passage(
        translationId,
        "translation",
        "translation",
        "Translation Practice",
        "Read the following passage carefully.\n\nLearning records are most useful when they preserve the reasoning behind an answer, rather than only the answer itself. (46) A concise record can show where a learner changed direction and why that change improved the final judgment.\n\nA good review system also needs to make uncertainty visible. It should distinguish a forgotten fact from a misunderstood relationship, because the two problems require different kinds of practice. (47) When uncertainty is named precisely, the next review session can begin with a concrete question instead of a vague feeling of failure.\n\nThe same principle applies to long passages and complex arguments. A learner who records only a final score may know that something went wrong but still have no route back to the source of the mistake. (48) Returning to the exact sentence that caused hesitation is often more valuable than reading the whole chapter again.\n\nReview is not a second attempt to remember everything at once. It is a method for selecting one useful decision, checking it against the evidence, and carrying the result into the next task. (49) This turns correction into a small experiment rather than a judgment about personal ability.\n\nOver time, these small records form a map of the learner's changing habits. The map is not meant to be complete; it only needs to be clear enough to guide the next step. (50) A stable review habit grows from repeated decisions that remain visible after the original exercise is over.",
        10,
        6,
      ),
      passage(
        smallWritingId,
        "writing",
        "small_writing",
        "Small Writing",
        "Write an email to a friend who is preparing for an important exam.\n\nIn your email, you should:\n\n1) offer one practical suggestion;\n2) explain why it may help.\n\nWrite your answer in about 100 words on the ANSWER SHEET. (10 points)",
        10,
        7,
      ),
      passage(
        bigWritingId,
        "writing",
        "big_writing",
        "Big Writing",
        bigWritingPrompt,
        20,
        8,
      ),
    ],
    questions: [
      question(readingId + "-q21", readingId, "21", "What can be learned about donkeys from Paragraph 1?", "C", 1, choices(
        "They seemed mysterious to human ancestors.",
        "They underwent multiple domestication events.",
        "They were tamed at an earlier time than horses.",
        "They were vividly portrayed by ancient travelers.",
      )),
      question(readingId + "-q22", readingId, "22", "What message is conveyed in Brooks' statement?", "D", 2, choices(
        "The earliest habitats of donkeys are hardly traceable.",
        "It is increasingly easy to read donkeys' DNA sequences.",
        "Written accounts contain vital clues for donkey research.",
        "Genetic analysis offers insight into the history of donkeys.",
      )),
      question(readingId + "-q23", readingId, "23", "In their study, the researchers investigated how donkeys ____", "A", 3, choices(
        "dispersed widely in the world.",
        "survived with the help of herders.",
        "developed certain behavioral traits.",
        "adapted to the changing environment.",
      )),
      question(readingId + "-q24", readingId, "24", "As to why the original domestication of donkeys happened, Orlando ____", "B", 4, choices(
        "challenges conventional ideas.",
        "provides a possible explanation.",
        "calls for evidence from the Sahara.",
        "holds a different view from Kreier.",
      )),
      question(readingId + "-q25", readingId, "25", "The authors think that their research could help with ____", "B", 5, choices(
        "greater protection of wildlife.",
        "better management of donkeys.",
        "recovering early types of donkeys.",
        "raising awareness of climate change.",
      )),
      question(clozeId + "-q1", clozeId, "1", "Still", "A", 1, choices("Still", "Therefore", "Afterward", "Instead"), 0.5),
      question(clozeId + "-q2", clozeId, "2", "dominating", "D", 2, choices("reviewing", "narrating", "ignoring", "dominating"), 0.5),
      question(clozeId + "-q3", clozeId, "3", "area", "B", 3, choices("reason", "area", "clue", "belief"), 0.5),
      question(clozeId + "-q4", clozeId, "4", "Combining", "C", 4, choices("Balancing", "Distinguishing", "Combining", "Introducing"), 0.5),
      question(clozeId + "-q5", clozeId, "5", "outcomes", "B", 5, choices("prospects", "outcomes", "ambitions", "sentiments"), 0.5),
      question(clozeId + "-q6", clozeId, "6", "For instance", "C", 6, choices("At first", "By comparison", "For instance", "In general"), 0.5),
      question(clozeId + "-q7", clozeId, "7", "test", "A", 7, choices("test", "copy", "link", "save"), 0.5),
      question(clozeId + "-q8", clozeId, "8", "before", "D", 8, choices("upon", "beyond", "through", "before"), 0.5),
      question(clozeId + "-q9", clozeId, "9", "explore", "A", 9, choices("explore", "recall", "simplify", "cherish"), 0.5),
      question(clozeId + "-q10", clozeId, "10", "analyze", "D", 10, choices("recover", "arrange", "reserve", "analyze"), 0.5),
      question(clozeId + "-q11", clozeId, "11", "customized", "D", 11, choices("localized", "normalized", "randomized", "customized"), 0.5),
      question(clozeId + "-q12", clozeId, "12", "In this way", "D", 12, choices("At best", "To the contrary", "By definition", "In this way"), 0.5),
      question(clozeId + "-q13", clozeId, "13", "concerns", "C", 13, choices("divisions", "expectations", "concerns", "values"), 0.5),
      question(clozeId + "-q14", clozeId, "14", "pressures", "A", 14, choices("pressures", "mysteries", "understandings", "suspicions"), 0.5),
      question(clozeId + "-q15", clozeId, "15", "Additionally", "B", 15, choices("Approximately", "Additionally", "Alternatively", "Accidentally"), 0.5),
      question(clozeId + "-q16", clozeId, "16", "contribute to", "C", 16, choices("deal with", "result from", "contribute to", "focus on"), 0.5),
      question(clozeId + "-q17", clozeId, "17", "relying", "C", 17, choices("starting", "checking", "relying", "working"), 0.5),
      question(clozeId + "-q18", clozeId, "18", "such as", "B", 18, choices("apart from", "such as", "regardless of", "prior to"), 0.5),
      question(clozeId + "-q19", clozeId, "19", "appreciation", "B", 19, choices("imitation", "appreciation", "preservation", "consumption"), 0.5),
      question(clozeId + "-q20", clozeId, "20", "replace", "A", 20, choices("replace", "seize", "share", "reflect"), 0.5),
      ...[11, 12, 13, 14, 15].map((questionNo, index) => question(
        `${insertionId}-q${questionNo}`,
        insertionId,
        String(questionNo),
        `Choose the sentence for blank ${questionNo}.`,
        ["A", "C", "F", "D", "B"][index],
        index + 1,
        insertionChoices,
      )),
      ...[11, 12, 13, 14, 15].map((questionNo, index) => question(
        `${orderingId}-q${questionNo}`,
        orderingId,
        String(questionNo),
        `Choose the paragraph for position ${ENGLISH_ORDERING_ANSWER_POSITIONS[index]}.`,
        String(ENGLISH_ORDERING_ANSWER_POSITIONS[index]),
        index + 1,
        orderingNumberOptions,
      )),
      ...[11, 12, 13, 14, 15].map((questionNo, index) => question(
        `${headingId}-q${questionNo}`,
        headingId,
        String(questionNo),
        `Choose the heading for paragraph ${questionNo - 10}.`,
        ["A", "B", "C", "D", "E"][index],
        index + 1,
        headingChoices,
      )),
      subjectiveQuestion(translationId + "-q1", translationId, "46", "A concise record can show where a learner changed direction and why that change improved the final judgment.", 2, 1),
      subjectiveQuestion(translationId + "-q2", translationId, "47", "When uncertainty is named precisely, the next review session can begin with a concrete question instead of a vague feeling of failure.", 2, 2),
      subjectiveQuestion(translationId + "-q3", translationId, "48", "Returning to the exact sentence that caused hesitation is often more valuable than reading the whole chapter again.", 2, 3),
      subjectiveQuestion(translationId + "-q4", translationId, "49", "This turns correction into a small experiment rather than a judgment about personal ability.", 2, 4),
      subjectiveQuestion(translationId + "-q5", translationId, "50", "A stable review habit grows from repeated decisions that remain visible after the original exercise is over.", 2, 5),
      subjectiveQuestion(smallWritingId + "-q1", smallWritingId, "51", "Write an email to a friend who is preparing for an important exam. Offer one practical suggestion and explain why it may help.", 10, 1),
      subjectiveQuestion(
        bigWritingId + "-q1",
        bigWritingId,
        "52",
        bigWritingPrompt,
        20,
        1,
      ),
    ],
    attempts: [],
  };
}
