import { normalizeExplanation } from "./explanation-format.js";
import { normalizeQuestionDiagramFields } from "./quiz-diagrams.js";
import { prepareQuizOptionMarkdown, sanitizeQuizText } from "./quiz-display-text.js";
import {
  buildCurriculumPromptContext,
  getCurriculumPickerTree,
  getFlatFocusLabels,
  getSubtopicsForTopicKey,
  getTopicEntries,
  getTopicKeysForYear,
  parseFocusLabel,
  formatFocusLabel,
  topicKey,
  FOCUS_SEPARATOR,
} from "./curriculum-topics.js";
import { YEAR_LEVELS } from "./year-levels.js";

export {
  buildCurriculumPromptContext,
  getCurriculumPickerTree,
  getFlatFocusLabels,
  getSubtopicsForTopicKey,
  getTopicEntries,
  getTopicKeysForYear,
  parseFocusLabel,
  formatFocusLabel,
  topicKey,
  FOCUS_SEPARATOR,
};

export const fallbackCurriculum = {
  Mathematics: {
    overview:
      "Year 7 Mathematics builds fluency with number, algebra, measurement, space, statistics, and probability.",
    focuses: [
      "Integers and rational numbers",
      "Algebraic patterns",
      "Fractions, decimals, and percentages",
      "Angles and geometric reasoning",
      "Data displays and probability",
    ],
    quiz: [
      {
        question: "Which number is the additive inverse of -8?",
        options: ["8", "-8", "0", "1/8"],
        answer: "8",
        explanation: "An additive inverse sums with the original number to make zero.",
      },
      {
        question: "A pattern starts 4, 9, 14, 19. What is the next term?",
        options: ["21", "23", "24", "25"],
        answer: "24",
        explanation: "The pattern increases by 5 each time.",
      },
      {
        question: "What is 25% of 240?",
        options: ["24", "48", "60", "96"],
        answer: "60",
        explanation: "25% is one quarter, and one quarter of 240 is 60.",
      },
      {
        question: "Two angles on a straight line total how many degrees?",
        options: ["90", "120", "180", "360"],
        answer: "180",
        explanation: "Adjacent angles on a straight line are supplementary.",
      },
      {
        question: "Which display is best for comparing categories such as favourite sports?",
        options: ["Bar chart", "Line graph", "Scatter plot", "Pie chart only"],
        answer: "Bar chart",
        explanation: "Bar charts make category comparisons clear.",
      },
    ],
  },
  English: {
    overview:
      "Year 7 English develops close reading, persuasive writing, literary analysis, and oral communication.",
    focuses: [
      "Narrative structure",
      "Persuasive techniques",
      "Language choices and tone",
      "Media texts",
      "Speaking and listening",
    ],
    quiz: [
      {
        question: "Which part of a narrative usually introduces characters and setting?",
        options: ["Orientation", "Climax", "Resolution", "Coda"],
        answer: "Orientation",
        explanation: "The orientation establishes who, where, and when.",
      },
      {
        question: "What is a rhetorical question used for in persuasive writing?",
        options: [
          "To confuse the reader",
          "To invite the audience to think",
          "To list evidence",
          "To show dialogue",
        ],
        answer: "To invite the audience to think",
        explanation: "Rhetorical questions prompt reflection without requiring an answer.",
      },
      {
        question: "Which phrase best describes tone?",
        options: ["The writer's attitude", "The number of paragraphs", "A spelling rule", "A text type"],
        answer: "The writer's attitude",
        explanation: "Tone is created by language choices that suggest attitude or feeling.",
      },
      {
        question: "A headline is mainly designed to do what?",
        options: ["Cite sources", "Attract attention", "End the article", "Replace evidence"],
        answer: "Attract attention",
        explanation: "Media headlines quickly draw readers into a text.",
      },
      {
        question: "What should a speaker do when presenting to a class?",
        options: ["Avoid eye contact", "Use clear pace and volume", "Read silently", "Face away"],
        answer: "Use clear pace and volume",
        explanation: "Clear delivery helps the audience understand the message.",
      },
    ],
  },
  Science: {
    overview:
      "Year 7 Science explores scientific inquiry, classification, Earth systems, forces, and matter.",
    focuses: [
      "Classification keys",
      "Mixtures and separation",
      "Forces",
      "Earth, Sun, and Moon",
      "Scientific investigations",
    ],
    quiz: [
      {
        question: "What does a dichotomous key help scientists do?",
        options: ["Measure time", "Classify organisms", "Create electricity", "Predict weather"],
        answer: "Classify organisms",
        explanation: "A dichotomous key uses paired choices to identify living things.",
      },
      {
        question: "Which method separates sand from water?",
        options: ["Filtration", "Evaporation only", "Magnetism", "Chromatography"],
        answer: "Filtration",
        explanation: "Filtration traps insoluble sand while water passes through.",
      },
      {
        question: "A push or pull is called a what?",
        options: ["Force", "Mixture", "Orbit", "Variable"],
        answer: "Force",
        explanation: "Forces are pushes or pulls that can change motion.",
      },
      {
        question: "What causes the phases of the Moon?",
        options: [
          "Earth's shadow every night",
          "Changing view of the sunlit Moon",
          "Cloud cover",
          "The Moon changing shape",
        ],
        answer: "Changing view of the sunlit Moon",
        explanation: "We see different portions of the Moon's sunlit half during its orbit.",
      },
      {
        question: "In a fair test, what should be changed on purpose?",
        options: ["Controlled variable", "Independent variable", "All variables", "Conclusion"],
        answer: "Independent variable",
        explanation: "The independent variable is deliberately changed to observe its effect.",
      },
    ],
  },
  Humanities: {
    overview:
      "Year 7 Humanities covers history, geography, civics, citizenship, economics, and business concepts.",
    focuses: [
      "Ancient societies",
      "Place and liveability",
      "Water in the world",
      "Australian democracy",
      "Consumers and producers",
    ],
    quiz: [
      {
        question: "Which source is created during the time being studied?",
        options: ["Primary source", "Secondary source", "Textbook glossary", "Modern summary"],
        answer: "Primary source",
        explanation: "Primary sources come from the period or event under investigation.",
      },
      {
        question: "Liveability is most connected to which question?",
        options: [
          "How suitable is a place to live?",
          "How old is a mountain?",
          "How fast is a river?",
          "How heavy is a building?",
        ],
        answer: "How suitable is a place to live?",
        explanation: "Liveability considers services, safety, environment, and community needs.",
      },
      {
        question: "Which is a key feature of Australia's democracy?",
        options: ["Compulsory voting", "One-party rule", "No elections", "Inherited parliament seats"],
        answer: "Compulsory voting",
        explanation: "Eligible Australian citizens are required to enrol and vote.",
      },
      {
        question: "A consumer is someone who does what?",
        options: ["Buys or uses goods and services", "Only makes laws", "Studies fossils", "Controls weather"],
        answer: "Buys or uses goods and services",
        explanation: "Consumers purchase or use goods and services to meet wants and needs.",
      },
      {
        question: "Why is water management important in Australia?",
        options: [
          "Rainfall and supply vary across places",
          "All regions have identical rainfall",
          "Water cannot be recycled",
          "Rivers never change",
        ],
        answer: "Rainfall and supply vary across places",
        explanation: "Australia's water availability is uneven and needs careful management.",
      },
    ],
  },
  "Health and Physical Education": {
    overview:
      "Year 7 Health and Physical Education supports wellbeing, respectful relationships, movement skills, and safety.",
    focuses: [
      "Personal identity",
      "Respectful relationships",
      "Safety and help-seeking",
      "Movement strategies",
      "Fitness components",
    ],
    quiz: [
      {
        question: "Which action shows respectful communication?",
        options: ["Listening actively", "Interrupting often", "Ignoring boundaries", "Mocking opinions"],
        answer: "Listening actively",
        explanation: "Active listening helps people feel heard and respected.",
      },
      {
        question: "What should you do if a situation feels unsafe?",
        options: ["Seek help from a trusted adult", "Keep it secret", "Ignore it", "Blame yourself"],
        answer: "Seek help from a trusted adult",
        explanation: "Help-seeking is a protective strategy.",
      },
      {
        question: "Which fitness component is most linked to running for a long time?",
        options: ["Cardiorespiratory endurance", "Flexibility", "Reaction time", "Balance"],
        answer: "Cardiorespiratory endurance",
        explanation: "Sustained activity relies on heart and lung endurance.",
      },
      {
        question: "In team games, why is space important?",
        options: ["It creates passing options", "It stops rules applying", "It removes teamwork", "It reduces safety"],
        answer: "It creates passing options",
        explanation: "Using space helps teams move and keep possession.",
      },
      {
        question: "Identity can be influenced by which factor?",
        options: ["Family and culture", "Only shoe size", "Only the weather", "No outside factors"],
        answer: "Family and culture",
        explanation: "Identity is shaped by many social, cultural, and personal influences.",
      },
    ],
  },
  "The Arts": {
    overview:
      "Year 7 Arts develops creative practice, interpretation, performance, media, design, and reflection.",
    focuses: [
      "Visual conventions",
      "Drama elements",
      "Music rhythm and texture",
      "Media storytelling",
      "Creative reflection",
    ],
    quiz: [
      {
        question: "In visual art, contrast is used to do what?",
        options: ["Create difference and emphasis", "Remove all detail", "Make every colour identical", "Avoid meaning"],
        answer: "Create difference and emphasis",
        explanation: "Contrast helps important elements stand out.",
      },
      {
        question: "Which drama element describes where and when action happens?",
        options: ["Setting", "Pitch", "Texture", "Aperture"],
        answer: "Setting",
        explanation: "Setting frames the time and place of a performance.",
      },
      {
        question: "Rhythm in music is mainly about what?",
        options: ["Patterns of sound and silence", "Only volume", "Only lyrics", "The colour of instruments"],
        answer: "Patterns of sound and silence",
        explanation: "Rhythm organizes beats, durations, and rests.",
      },
      {
        question: "A storyboard helps media makers plan what?",
        options: ["Shots and sequence", "Lunch orders", "Keyboard shortcuts only", "Paint drying time"],
        answer: "Shots and sequence",
        explanation: "Storyboards map visuals before production.",
      },
      {
        question: "Creative reflection asks artists to consider what?",
        options: ["Choices, effects, and improvements", "Only the final grade", "Nothing after making", "Only the price"],
        answer: "Choices, effects, and improvements",
        explanation: "Reflection supports stronger creative decisions over time.",
      },
    ],
  },
};

export const yearLevelFocuses = {
  "Year 7": Object.fromEntries(Object.entries(fallbackCurriculum).map(([subject, data]) => [subject, data.focuses])),
  "Year 8": {
    Mathematics: [
      "Linear relationships and graphing",
      "Ratios, rates, and financial contexts",
      "Index laws and scientific notation",
      "Area, volume, and surface area",
      "Probability experiments and data investigation",
    ],
    English: [
      "Comparing themes across texts",
      "Analysing persuasive viewpoints",
      "Narrative voice and characterisation",
      "Media bias and representation",
      "Planning sustained analytical responses",
    ],
    Science: [
      "Cells and body systems",
      "Chemical change and reactions",
      "Energy transfer",
      "Rock cycle and geological time",
      "Experimental design and variables",
    ],
    Humanities: [
      "Medieval societies",
      "Landforms and landscapes",
      "Changing nations",
      "Rights and responsibilities",
      "Markets, work, and enterprise",
    ],
    "Health and Physical Education": [
      "Managing change and identity",
      "Mental health and help-seeking",
      "Respectful relationships online",
      "Game tactics and decision-making",
      "Training principles and fitness plans",
    ],
    "The Arts": [
      "Visual composition and symbolism",
      "Drama tension and focus",
      "Music form and arrangement",
      "Media codes and conventions",
      "Design process and audience",
    ],
  },
  "Year 9": {
    Mathematics: [
      "Pythagoras theorem and trigonometry",
      "Linear and non-linear relationships",
      "Financial mathematics",
      "Similarity and scale",
      "Bivariate data and statistics",
    ],
    English: [
      "Analysing argument and viewpoint",
      "Creative and reflective writing",
      "Comparative text study",
      "Language and identity",
      "Research and citation",
    ],
    Science: [
      "Atomic structure and chemical reactions",
      "Ecosystems and biodiversity",
      "Motion, energy, and waves",
      "Plate tectonics and global systems",
      "Science inquiry and ethics",
    ],
    Humanities: [
      "Industrialisation and social change",
      "Geographies of interconnection",
      "Political systems and participation",
      "Economic performance and living standards",
      "Historical interpretation",
    ],
    "Health and Physical Education": [
      "Health literacy and decision-making",
      "Resilience and mental wellbeing",
      "Movement analysis and biomechanics",
      "Ethics in sport and physical activity",
      "Community health promotion",
    ],
    "The Arts": [
      "Visual art analysis and production",
      "Drama performance and direction",
      "Music composition and performance",
      "Media production and audience",
      "Design thinking and evaluation",
    ],
  },
  "Year 10": {
    Mathematics: [
      "Quadratic and exponential relationships",
      "Trigonometry and measurement",
      "Statistics and chance",
      "Financial planning and interest",
      "Proof and geometric reasoning",
    ],
    English: [
      "Crafting analytical essays",
      "Persuasive and hybrid texts",
      "Literary themes and context",
      "Oral presentation skills",
      "Editing and language conventions",
    ],
    Science: [
      "Chemical equations and stoichiometry",
      "Genetics and evolution",
      "Electricity and electromagnetic spectrum",
      "Climate science and sustainability",
      "Controlled experiments and validity",
    ],
    Humanities: [
      "World War and modern conflict",
      "Environmental change and management",
      "Law, justice, and human rights",
      "Globalisation and trade",
      "Civic participation projects",
    ],
    "Health and Physical Education": [
      "Health promotion campaigns",
      "Relationships and consent education",
      "Training programs and fitness testing",
      "Outdoor education and risk management",
      "Nutrition and performance",
    ],
    "The Arts": [
      "Portfolio development",
      "Theatre production roles",
      "Music technology and recording",
      "Film and digital storytelling",
      "Exhibition and critique",
    ],
  },
  "Year 11": {
    Mathematics: [
      "Functions and graphs (VCE General/Further)",
      "Algebraic methods and calculus introduction",
      "Data analysis and probability",
      "Measurement and trigonometry applications",
      "Financial and statistical modelling",
    ],
    English: [
      "Text response and metalanguage",
      "Comparative analysis of texts",
      "Argument and language analysis",
      "Creative response to texts",
      "Exam-style planning and revision",
    ],
    Science: [
      "Biology: cells and biomolecules",
      "Chemistry: atomic structure and bonding",
      "Physics: motion and energy",
      "Psychology foundations (where offered)",
      "Scientific investigation and reporting",
    ],
    Humanities: [
      "Revolutions and change",
      "Twentieth-century history",
      "Geography fieldwork and GIS",
      "Legal studies: rights and the courts",
      "Economics and business decision-making",
    ],
    "Health and Physical Education": [
      "Training principles and periodisation",
      "Biomechanics and skill acquisition",
      "Health and human development",
      "Outdoor and environmental education",
      "Coaching and leadership",
    ],
    "The Arts": [
      "Solo and ensemble performance",
      "Art making and folio presentation",
      "Media narrative and production design",
      "Drama interpretation and staging",
      "Critical analysis of artworks",
    ],
  },
  "Year 12": {
    Mathematics: [
      "VCE Further Mathematics: data and recursion",
      "VCE Mathematical Methods: calculus and functions",
      "VCE Specialist Mathematics: vectors and proofs",
      "Exam strategies and CAS skills",
      "Modelling and investigation tasks",
    ],
    English: [
      "VCE English: text response under time pressure",
      "VCE English: comparative essay structure",
      "VCE English Language: language variation",
      "Argument analysis and contemporary issues",
      "Revision of metalanguage and sample responses",
    ],
    Science: [
      "VCE Biology: study design key knowledge",
      "VCE Chemistry: stoichiometry and equilibrium",
      "VCE Physics: fields and motion",
      "Psychology: research methods and ethics",
      "Science exam technique and data interpretation",
    ],
    Humanities: [
      "VCE History: revolutions depth study",
      "VCE Geography: hazard and land use change",
      "VCE Legal Studies: rights and the Constitution",
      "VCE Economics: markets and policy",
      "Extended responses and source analysis",
    ],
    "Health and Physical Education": [
      "VCE Physical Education: energy systems",
      "VCE Health and Human Development",
      "Training programs and acute responses",
      "Sociocultural influences on health",
      "Exam preparation and case studies",
    ],
    "The Arts": [
      "VCE Studio Arts: folio and exhibition",
      "VCE Music performance and analysis",
      "VCE Media: narrative and ideology",
      "VCE Drama: monologue and ensemble",
      "Art and design exam preparation",
    ],
  },
};

export function getSubjectNames() {
  return Object.keys(fallbackCurriculum);
}

export function getYearLevels() {
  return YEAR_LEVELS;
}

export function getFocusesForYear(subject, yearLevel = "Year 7") {
  const hierarchical = getFlatFocusLabels(yearLevel, subject);
  if (hierarchical.length) {
    return hierarchical;
  }
  return yearLevelFocuses[yearLevel]?.[subject] || fallbackCurriculum[subject]?.focuses || [];
}

/** @deprecated Legacy flat map; prefer getCurriculumPickerTree() for UI. */
export const curriculumPickerTree = getCurriculumPickerTree();

export function createFallbackQuiz({ subject, focus, questionCount, difficulty, yearLevel = "Year 7" }) {
  const subjectData = fallbackCurriculum[subject] || fallbackCurriculum.Science;
  const questions = subjectData.quiz.slice(0, questionCount);

  return {
    subject,
    focus,
    yearLevel,
    curriculumSummary: subjectData.overview.replace("Year 7", yearLevel),
    learningIntentions: [
      `Review core ${yearLevel} ${subject} concepts related to ${focus}.`,
      `Apply ${difficulty === "mixed" ? "core and extension" : difficulty} understanding in quiz responses.`,
      "Use feedback explanations to improve subject vocabulary and reasoning.",
    ],
    questions,
  };
}

export function validateQuizData(data) {
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error("The quiz response did not include any questions.");
  }

  return {
    subject: String(data.subject || "Year 7 subject"),
    focus: String(data.focus || "General review"),
    yearLevel: String(data.yearLevel || "Year 7"),
    curriculumSummary: String(data.curriculumSummary || "Curriculum-aligned sample quiz."),
    learningIntentions: Array.isArray(data.learningIntentions)
      ? data.learningIntentions.map(String).slice(0, 5)
      : [],
    questions: data.questions.map((question, index) => {
      const options = Array.isArray(question.options)
        ? question.options.map((option) => prepareQuizOptionMarkdown(String(option))).slice(0, 6)
        : [];
      if (!question.question || options.length < 2 || !question.answer) {
        throw new Error(`Question ${index + 1} is incomplete.`);
      }
      const normalized = normalizeQuestionDiagramFields({
        ...question,
        question: sanitizeQuizText(String(question.question)),
        options,
        answer: prepareQuizOptionMarkdown(String(question.answer)),
        explanation: normalizeExplanation(question.explanation || "Review the curriculum notes for this concept."),
        imageUrl: question.imageUrl ? String(question.imageUrl) : "",
        imageAlt: question.imageAlt ? String(question.imageAlt) : "",
        imageError: question.imageError ? String(question.imageError) : "",
        imageGenerated: question.imageGenerated ? String(question.imageGenerated) : "",
      });

      return {
        ...normalized,
        ...(Number.isFinite(Number(question.timeLimitSeconds)) && Number(question.timeLimitSeconds) > 0
          ? { timeLimitSeconds: Math.round(Number(question.timeLimitSeconds)) }
          : {}),
      };
    }),
  };
}
