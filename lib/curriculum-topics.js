/**
 * Hierarchical curriculum map: Year → Subject → [Topic → Subtopics].
 * Aligned to ACARA v9 content strands and Victorian VCE study designs where noted.
 * See docs/CURRICULUM-SOURCE.md for provenance and limits.
 */

function entry(topic, subtopics, { stream = null, source = null } = {}) {
  return {
    topic: String(topic),
    subtopics: subtopics.map(String),
    stream: stream ? String(stream) : null,
    source: source ? String(source) : null,
  };
}

/** @type {Record<string, Record<string, Array<{ topic: string, subtopics: string[], stream: string|null, source: string|null }>>>} */
export const CURRICULUM_HIERARCHY = {
  "Year 7": {
    Mathematics: [
      entry("Integers and rational numbers", [
        "Ordering and comparing integers",
        "Adding and subtracting integers",
        "Multiplying and dividing integers",
        "Fractions, decimals, and percentages",
        "Financial contexts with money",
      ], { source: "AC9M7N01–N09" }),
      entry("Algebraic thinking", [
        "Number patterns and rules",
        "Simple algebraic expressions",
        "Substituting values into formulas",
        "Equivalent expressions",
      ], { source: "AC9M7A01–A02" }),
      entry("Measurement and geometry", [
        "Angles on lines and at a point",
        "Area of rectangles and triangles",
        "Volume of rectangular prisms",
        "Circumference and area of circles",
        "Cartesian plane and coordinates",
      ], { source: "AC9M7M01–M06, AC9M7SP01" }),
      entry("Statistics and probability", [
        "Data displays: tables and graphs",
        "Mean, median, and mode",
        "Probability of single events",
        "Interpreting data in context",
      ], { source: "AC9M7ST01–ST03, AC9M7P01" }),
    ],
    English: [
      entry("Narrative and story craft", [
        "Orientation, complication, resolution",
        "Character and setting",
        "Narrative voice and point of view",
        "Descriptive language choices",
      ], { source: "AC9E7LA03, AC9E7LE03" }),
      entry("Persuasive writing", [
        "Audience, purpose, and tone",
        "Rhetorical questions and emotive language",
        "Structuring an argument",
        "Rebuttal and counter-arguments",
      ], { source: "AC9E7LY06" }),
      entry("Language analysis", [
        "Figurative language: simile and metaphor",
        "Connotation and word choice",
        "Text structures in informative texts",
        "Summarising and paraphrasing",
      ], { source: "AC9E7LA01–LA05" }),
      entry("Media literacy", [
        "Headlines and lead paragraphs",
        "Visual and written codes in media",
        "Bias and representation",
        "Purpose of different text types",
      ], { source: "AC9E7LY05" }),
    ],
    Science: [
      entry("Classification and ecosystems", [
        "Dichotomous keys",
        "Classification of living things",
        "Food webs and energy flow",
        "Habitat and adaptation",
      ], { source: "AC9S7U03" }),
      entry("Mixtures and separation", [
        "Pure substances vs mixtures",
        "Filtration, evaporation, and distillation",
        "Solutions and solubility",
        "Particle model of matter",
      ], { source: "AC9S7U04" }),
      entry("Forces and motion", [
        "Contact and non-contact forces",
        "Balanced and unbalanced forces",
        "Friction and gravity",
        "Simple machines in context",
      ], { source: "AC9S7U05" }),
      entry("Earth and space", [
        "Earth, Sun, and Moon relationships",
        "Phases of the Moon",
        "Seasons and Earth's tilt",
        "Renewable and non-renewable resources",
      ], { source: "AC9S7U01–U02" }),
    ],
    Humanities: [
      entry("Ancient societies", [
        "Primary and secondary sources",
        "Daily life in ancient civilisations",
        "Significant individuals and achievements",
        "Continuity and change over time",
      ], { source: "AC9HH7K01–K04" }),
      entry("Geography of place", [
        "Liveability factors",
        "Water in the world",
        "Place and environment connections",
        "Mapping skills and scale",
      ], { source: "AC9HG7K01–K03" }),
      entry("Civics and citizenship", [
        "Australian democracy and voting",
        "Rights and responsibilities",
        "Levels of government",
        "Community participation",
      ], { source: "AC9HC7K01–K03" }),
      entry("Economics and business", [
        "Consumers and producers",
        "Needs, wants, and decision-making",
        "Work and enterprise",
        "Financial literacy basics",
      ], { source: "AC9HE7K01–K02" }),
    ],
  },
  "Year 8": {
    Mathematics: [
      entry("Linear relationships", [
        "Plotting linear graphs",
        "Gradient and y-intercept",
        "Tables of values and rules",
        "Real-world rate problems",
      ], { source: "AC9M8A02–A03" }),
      entry("Ratios, rates, and finance", [
        "Equivalent ratios",
        "Unit rates and best buys",
        "Percentage increase and decrease",
        "Simple interest contexts",
      ], { source: "AC9M8N04–N05" }),
      entry("Index laws and notation", [
        "Index notation with whole numbers",
        "Scientific notation",
        "Square roots and perfect squares",
        "Applying index laws",
      ], { source: "AC9M8N01–N03" }),
      entry("Measurement", [
        "Area of composite shapes",
        "Surface area of prisms",
        "Volume of cylinders",
        "Pythagoras theorem introduction",
      ], { source: "AC9M8M01–M04" }),
      entry("Statistics and probability", [
        "Two-way tables",
        "Comparing data sets",
        "Experimental probability",
        "Sample space and outcomes",
      ], { source: "AC9M8ST01–ST02, AC9M8P01" }),
    ],
    English: [
      entry("Comparative text study", [
        "Comparing themes across texts",
        "Characterisation techniques",
        "Context and authorial intent",
        "Planning comparative paragraphs",
      ], { source: "AC9E8LE04" }),
      entry("Persuasive and argumentative texts", [
        "Analysing viewpoints",
        "Evidence and reasoning",
        "Modal verbs and tone",
        "Audience and purpose",
      ], { source: "AC9E8LY06" }),
      entry("Creative writing", [
        "Narrative structure and pacing",
        "Show don't tell",
        "Dialogue and voice",
        "Editing for clarity",
      ], { source: "AC9E8LY03" }),
      entry("Media and representation", [
        "Stereotypes in media",
        "Visual and written codes",
        "Target audience analysis",
        "Ethical representation",
      ], { source: "AC9E8LY05" }),
    ],
    Science: [
      entry("Cells and body systems", [
        "Plant and animal cell structures",
        "Organelles and their functions",
        "Body systems and coordination",
        "Microscope skills",
      ], { source: "AC9S8U01" }),
      entry("Chemical change", [
        "Physical vs chemical change",
        "Signs of chemical reactions",
        "Conservation of mass",
        "Acids, bases, and indicators",
      ], { source: "AC9S8U02" }),
      entry("Energy transfer", [
        "Forms of energy",
        "Energy transformations",
        "Heat transfer: conduction, convection, radiation",
        "Efficiency in systems",
      ], { source: "AC9S8U03" }),
      entry("Geological time", [
        "Rock cycle",
        "Fossils as evidence",
        "Plate tectonics introduction",
        "Natural hazards",
      ], { source: "AC9S8U04" }),
    ],
    Humanities: [
      entry("Medieval Europe", [
        "Feudal society and roles",
        "Crusades and trade",
        "Black Death and social change",
        "Historical significance",
      ], { source: "AC9HH8K01" }),
      entry("Landforms and landscapes", [
        "Geomorphic processes",
        "Landform types and formation",
        "Human interaction with landscapes",
        "Fieldwork and observation",
      ], { source: "AC9HG8K01" }),
      entry("Rights and democracy", [
        "Universal Declaration of Human Rights",
        "Australian legal system overview",
        "Participation in democracy",
        "Media and civic debate",
      ], { source: "AC9HC8K01" }),
      entry("Markets and enterprise", [
        "Supply and demand basics",
        "Business decision-making",
        "Employment and work conditions",
        "Global connections",
      ], { source: "AC9HE8K01" }),
    ],
  },
  "Year 9": {
    Mathematics: [
      entry("Pythagoras and trigonometry", [
        "Pythagoras theorem applications",
        "Trigonometric ratios (SOH CAH TOA)",
        "Angle of elevation and depression",
        "Bearings and navigation",
      ], { source: "AC9M9M03–M04" }),
      entry("Linear and non-linear graphs", [
        "Linear equations and graphs",
        "Parabolas and quadratics introduction",
        "Intercepts and turning points",
        "Modelling with graphs",
      ], { source: "AC9M9A02–A04" }),
      entry("Financial mathematics", [
        "Percentage profit and loss",
        "Simple and compound interest",
        "Budgeting and financial plans",
        "GST and tax contexts",
      ], { source: "AC9M9N05" }),
      entry("Similarity and scale", [
        "Similar figures and scale factors",
        "Enlargement and reduction",
        "Area and volume scale factors",
        "Geometric reasoning",
      ], { source: "AC9M9M02" }),
      entry("Statistics", [
        "Bivariate data and scatter plots",
        "Line of best fit",
        "Misleading graphs",
        "Sampling and bias",
      ], { source: "AC9M9ST01–ST02" }),
    ],
    English: [
      entry("Argument and viewpoint", [
        "Identifying contention",
        "Tone and persuasive devices",
        "Evaluating arguments",
        "Language analysis structure",
      ], { source: "AC9E9LY06" }),
      entry("Creative and reflective writing", [
        "Genre conventions",
        "Imagery and symbolism",
        "Reflective voice",
        "Drafting and revision",
      ], { source: "AC9E9LY03" }),
      entry("Comparative analysis", [
        "Metalanguage for text features",
        "Comparing authorial choices",
        "Context and audience",
        "Essay planning",
      ], { source: "AC9E9LE04" }),
      entry("Research skills", [
        "Reliable sources",
        "Citation and referencing",
        "Note-taking strategies",
        "Synthesising information",
      ], { source: "AC9E9LY07" }),
    ],
    Science: [
      entry("Atomic structure and bonding", [
        "Atomic models and periodic table",
        "Ionic and covalent bonding",
        "Balancing simple equations",
        "Properties of compounds",
      ], { source: "AC9S9U01" }),
      entry("Ecosystems and biodiversity", [
        "Energy pyramids",
        "Biotic and abiotic factors",
        "Human impact on ecosystems",
        "Conservation strategies",
      ], { source: "AC9S9U02" }),
      entry("Motion, energy, and waves", [
        "Speed, velocity, acceleration",
        "Newton's laws",
        "Work and energy",
        "Wave properties: frequency and amplitude",
      ], { source: "AC9S9U03" }),
      entry("Global systems", [
        "Plate tectonics and earthquakes",
        "Climate systems",
        "Carbon cycle",
        "Science inquiry and ethics",
      ], { source: "AC9S9U04" }),
    ],
    Humanities: [
      entry("Industrialisation", [
        "Causes of the Industrial Revolution",
        "Social and economic change",
        "Migration and urbanisation",
        "Historical interpretation",
      ], { source: "AC9HH9K01" }),
      entry("Geographies of interconnection", [
        "Globalisation and trade",
        "Technology and connectivity",
        "Cultural diffusion",
        "Sustainability challenges",
      ], { source: "AC9HG9K01" }),
      entry("Political systems", [
        "Democracy vs other systems",
        "Elections and representation",
        "International relations basics",
        "Media and political participation",
      ], { source: "AC9HC9K01" }),
      entry("Economics", [
        "Economic performance indicators",
        "Living standards and inequality",
        "Government role in economy",
        "Consumer and business decisions",
      ], { source: "AC9HE9K01" }),
    ],
  },
  "Year 10": {
    Mathematics: [
      entry("Quadratic and exponential relationships", [
        "Factorising quadratics",
        "Sketching parabolas",
        "Exponential growth and decay",
        "Applications in modelling",
      ], { source: "AC9M10A01–A02" }),
      entry("Trigonometry and measurement", [
        "Sine and cosine rules",
        "Area of non-right triangles",
        "Surface area and volume of composite solids",
        "Unit conversions in context",
      ], { source: "AC9M10M01–M03" }),
      entry("Statistics and chance", [
        "Two-way tables and conditional probability",
        "Standard deviation introduction",
        "Normal distribution basics",
        "Designing surveys",
      ], { source: "AC9M10ST01, AC9M10P01" }),
      entry("Financial planning", [
        "Compound interest formulas",
        "Depreciation",
        "Loan and investment comparisons",
        "Spreadsheet modelling",
      ], { source: "AC9M10N01" }),
      entry("Geometric reasoning", [
        "Circle theorems",
        "Similarity proofs",
        "Coordinate geometry",
        "Optimisation problems",
      ], { source: "AC9M10M04–M05" }),
    ],
    English: [
      entry("Analytical essay writing", [
        "TEEL/PEEL paragraph structure",
        "Embedding quotations",
        "Analysing authorial intent",
        "Exam-style planning",
      ], { source: "AC9E10LY06" }),
      entry("Persuasive and hybrid texts", [
        "Multimodal arguments",
        "Rhetorical appeals: ethos, pathos, logos",
        "Contemporary issues",
        "Audience and register",
      ], { source: "AC9E10LY05" }),
      entry("Literary themes and context", [
        "Historical and cultural context",
        "Theme development across a text",
        "Character arcs",
        "Intertextuality",
      ], { source: "AC9E10LE03" }),
      entry("Oral presentation", [
        "Structuring a spoken argument",
        "Voice, pace, and eye contact",
        "Visual aids and notes",
        "Responding to questions",
      ], { source: "AC9E10LY02" }),
    ],
    Science: [
      entry("Chemical reactions and stoichiometry", [
        "Balancing chemical equations",
        "Mole concept introduction",
        "Limiting reagents",
        "Reaction rates and catalysts",
      ], { source: "AC9S10U01" }),
      entry("Genetics and evolution", [
        "DNA structure and replication",
        "Mendelian inheritance",
        "Natural selection",
        "Evidence for evolution",
      ], { source: "AC9S10U02" }),
      entry("Electricity and electromagnetism", [
        "Ohm's law and circuits",
        "Series and parallel circuits",
        "Electromagnetic spectrum",
        "Energy efficiency",
      ], { source: "AC9S10U03" }),
      entry("Climate and sustainability", [
        "Greenhouse effect and climate change",
        "Renewable energy technologies",
        "Ecosystem services",
        "Scientific validity and reliability",
      ], { source: "AC9S10U04" }),
    ],
    Humanities: [
      entry("World War and modern conflict", [
        "Causes and consequences of WWI/WWII",
        "Propaganda and primary sources",
        "Human rights after conflict",
        "Historical empathy",
      ], { source: "AC9HH10K01" }),
      entry("Environmental change", [
        "Land use change",
        "Environmental management strategies",
        "Geospatial technologies",
        "Sustainability case studies",
      ], { source: "AC9HG10K01" }),
      entry("Law and human rights", [
        "Australian Constitution overview",
        "Court hierarchy",
        "Human rights protections",
        "Case study analysis",
      ], { source: "AC9HC10K01" }),
      entry("Globalisation", [
        "Trade agreements",
        "Multinational corporations",
        "Cultural exchange",
        "Civic action and advocacy",
      ], { source: "AC9HE10K01" }),
    ],
  },
  "Year 11": {
    Mathematics: [
      entry("Functions and graphs", [
        "Domain and range",
        "Transformations of functions",
        "Piecewise functions",
        "Modelling with functions",
      ], { stream: "VCE General/Further", source: "VCAA Further Maths U1–2" }),
      entry("Algebra and calculus introduction", [
        "Polynomial manipulation",
        "Differentiation basics",
        "Applications of derivatives",
        "Anti-derivatives introduction",
      ], { stream: "VCE Mathematical Methods", source: "VCAA Methods U1–2" }),
      entry("Data analysis", [
        "Univariate and bivariate statistics",
        "Normal distribution",
        "Linear regression",
        "Statistical reports",
      ], { stream: "VCE General/Further", source: "VCAA Further Maths U1–2" }),
      entry("Trigonometry and measurement", [
        "Circular functions",
        "Trigonometric identities",
        "Applications in 3D problems",
        "Measurement error",
      ], { stream: "VCE Mathematical Methods", source: "VCAA Methods U1–2" }),
    ],
    English: [
      entry("Text response", [
        "Metalanguage for narrative and argument",
        "Topic sentences and contention",
        "Character and theme analysis",
        "Timed planning strategies",
      ], { stream: "VCE English", source: "VCAA English U1–2" }),
      entry("Comparative analysis", [
        "Frameworks for comparison",
        "Context and values",
        "Integrating two texts",
        "Essay structure",
      ], { stream: "VCE English", source: "VCAA English U1–2" }),
      entry("Argument and language analysis", [
        "Identifying contention and tone",
        "Persuasive techniques",
        "Visual argument analysis",
        "Contemporary issue texts",
      ], { stream: "VCE English", source: "VCAA English U1–2" }),
      entry("Language variation", [
        "Register and formality",
        "Australian English features",
        "Subsystems: phonology, syntax, semantics",
        "Social factors in language use",
      ], { stream: "VCE English Language", source: "VCAA English Language U1–2" }),
    ],
    Science: [
      entry("Cells and biomolecules", [
        "Cellular respiration and photosynthesis",
        "Enzymes and metabolism",
        "Protein synthesis overview",
        "Experimental design in biology",
      ], { stream: "VCE Biology", source: "VCAA Biology U1–2" }),
      entry("Atomic structure and bonding", [
        "Periodic trends",
        "Intermolecular forces",
        "Stoichiometry and moles",
        "Redox introduction",
      ], { stream: "VCE Chemistry", source: "VCAA Chemistry U1–2" }),
      entry("Motion and energy", [
        "Kinematics equations",
        "Forces and Newton's laws",
        "Work, energy, and power",
        "Experimental uncertainty",
      ], { stream: "VCE Physics", source: "VCAA Physics U1–2" }),
      entry("Research methods", [
        "Hypothesis and variables",
        "Ethics in research",
        "Data collection methods",
        "Report writing conventions",
      ], { stream: "VCE Psychology", source: "VCAA Psychology U1–2" }),
    ],
    Humanities: [
      entry("Revolutions and change", [
        "Causes of revolution",
        "Key revolutionary figures",
        "Consequences for society",
        "Source analysis skills",
      ], { stream: "VCE History", source: "VCAA History U1–2" }),
      entry("Geography fieldwork", [
        "Fieldwork design",
        "GIS and spatial data",
        "Land use and hazard study",
        "Report writing",
      ], { stream: "VCE Geography", source: "VCAA Geography U1–2" }),
      entry("Legal foundations", [
        "Rights and the Constitution",
        "Court system and precedents",
        "Statute and common law",
        "Case study method",
      ], { stream: "VCE Legal Studies", source: "VCAA Legal Studies U1–2" }),
      entry("Markets and policy", [
        "Market structures",
        "Government intervention",
        "Macroeconomic indicators",
        "Business decision-making",
      ], { stream: "VCE Economics", source: "VCAA Economics U1–2" }),
    ],
  },
  "Year 12": {
    Mathematics: [
      entry("Recursion and financial modelling", [
        "Factorials and permutations",
        "Fibonacci and recurrence relations",
        "Arithmetic and geometric sequences",
        "Compound interest and loans",
        "Reducing balance depreciation",
      ], { stream: "VCE Further Mathematics", source: "VCAA Further Maths U3–4" }),
      entry("Data analysis and inference", [
        "Two-way frequency tables",
        "Normal distribution applications",
        "Linear regression and correlation",
        "Statistical investigation reports",
      ], { stream: "VCE Further Mathematics", source: "VCAA Further Maths U3–4" }),
      entry("Matrices", [
        "Matrix operations",
        "Transition matrices",
        "Dominant eigenvector applications",
        "Leslie matrix models",
      ], { stream: "VCE Further Mathematics", source: "VCAA Further Maths U3–4" }),
      entry("Calculus and functions", [
        "Differentiation rules",
        "Integration techniques",
        "Applications: max/min, area under curves",
        "Differential equations introduction",
      ], { stream: "VCE Mathematical Methods", source: "VCAA Methods U3–4" }),
      entry("Probability and distributions", [
        "Discrete and continuous random variables",
        "Binomial distribution",
        "Normal approximation",
        "Expected value",
      ], { stream: "VCE Mathematical Methods", source: "VCAA Methods U3–4" }),
      entry("Vectors and proof", [
        "Vector algebra in 2D and 3D",
        "Scalar and vector products",
        "Geometric proofs",
        "Complex numbers",
      ], { stream: "VCE Specialist Mathematics", source: "VCAA Specialist Maths U3–4" }),
    ],
    English: [
      entry("Text response under time pressure", [
        "Prompt unpacking",
        "Thesis and roadmap",
        "Embedding and analysing quotes",
        "Exam timing strategies",
      ], { stream: "VCE English", source: "VCAA English U3–4" }),
      entry("Comparative essay structure", [
        "Integrated vs block structure",
        "Context and values comparison",
        "Metalanguage across texts",
        "High-scoring sample features",
      ], { stream: "VCE English", source: "VCAA English U3–4" }),
      entry("Argument analysis", [
        "Contention and tone tracking",
        "Persuasive and visual language",
        "Contemporary media texts",
        "Paragraph scaffolding",
      ], { stream: "VCE English", source: "VCAA English U3–4" }),
      entry("Language variation and change", [
        "Formal vs informal register",
        "Australian English identity",
        "Language acquisition",
        "Subsystems in analysis",
      ], { stream: "VCE English Language", source: "VCAA English Language U3–4" }),
    ],
    Science: [
      entry("Cellular processes and immunity", [
        "Cellular signalling",
        "Immune response pathways",
        "Biotechnology applications",
        "Experimental data interpretation",
      ], { stream: "VCE Biology", source: "VCAA Biology U3–4" }),
      entry("Equilibrium and redox", [
        "Le Chatelier's principle",
        "Electrochemical cells",
        "Acid-base equilibria",
        "Stoichiometric calculations",
      ], { stream: "VCE Chemistry", source: "VCAA Chemistry U3–4" }),
      entry("Fields and motion", [
        "Electric and magnetic fields",
        "Projectile motion",
        "Circular motion",
        "Special relativity introduction",
      ], { stream: "VCE Physics", source: "VCAA Physics U3–4" }),
      entry("Research and ethics", [
        "Experimental design evaluation",
        "Statistical analysis in psychology",
        "Ethical guidelines",
        "Report structure for SACs",
      ], { stream: "VCE Psychology", source: "VCAA Psychology U3–4" }),
    ],
    Humanities: [
      entry("Revolutions depth study", [
        "Causes, events, and consequences",
        "Historiography and debate",
        "Primary source evaluation",
        "Extended response structure",
      ], { stream: "VCE History", source: "VCAA History U3–4" }),
      entry("Hazard and land use change", [
        "Risk assessment frameworks",
        "Climate hazard case studies",
        "Land use planning",
        "Fieldwork and GIS analysis",
      ], { stream: "VCE Geography", source: "VCAA Geography U3–4" }),
      entry("Rights and the Constitution", [
        "Division of powers",
        "High Court interpretations",
        "Human rights charters",
        "Contemporary legal issues",
      ], { stream: "VCE Legal Studies", source: "VCAA Legal Studies U3–4" }),
      entry("Markets and government policy", [
        "Fiscal and monetary policy",
        "Market failure",
        "International trade",
        "Data interpretation in economics",
      ], { stream: "VCE Economics", source: "VCAA Economics U3–4" }),
    ],
  },
};

export const FOCUS_SEPARATOR = " — ";

export function topicKey(entryRow) {
  return entryRow.stream ? `${entryRow.stream} / ${entryRow.topic}` : entryRow.topic;
}

export function formatFocusLabel(entryRow, subtopic) {
  return `${topicKey(entryRow)}${FOCUS_SEPARATOR}${subtopic}`;
}

export function parseFocusLabel(focus) {
  const text = String(focus || "").trim();
  if (!text.includes(FOCUS_SEPARATOR)) {
    return { stream: null, topic: text, subtopic: null, label: text };
  }
  const [left, subtopic] = text.split(FOCUS_SEPARATOR).map((part) => part.trim());
  if (left.includes(" / ")) {
    const slashIndex = left.indexOf(" / ");
    return {
      stream: left.slice(0, slashIndex).trim(),
      topic: left.slice(slashIndex + 3).trim(),
      subtopic,
      label: text,
    };
  }
  return { stream: null, topic: left, subtopic, label: text };
}

export function getTopicEntries(yearLevel, subject) {
  return CURRICULUM_HIERARCHY[yearLevel]?.[subject] || [];
}

export function getTopicKeysForYear(yearLevel, subject) {
  return getTopicEntries(yearLevel, subject).map((row) => topicKey(row));
}

export function getSubtopicsForTopicKey(yearLevel, subject, key) {
  const row = getTopicEntries(yearLevel, subject).find((entryRow) => topicKey(entryRow) === key);
  return row?.subtopics || [];
}

function addTermsFromTopicRow(terms, row) {
  if (!row) {
    return;
  }
  terms.add(row.topic);
  if (row.stream) {
    terms.add(row.stream);
  }
  for (const subtopic of row.subtopics) {
    terms.add(subtopic);
  }
}

function addTermsFromFocusLabel(terms, entries, focusLabel, { includeSiblingSubtopics = false } = {}) {
  const parsed = parseFocusLabel(focusLabel);
  if (parsed.stream) {
    terms.add(parsed.stream);
  }
  if (parsed.topic) {
    terms.add(parsed.topic);
  }
  if (parsed.subtopic) {
    terms.add(parsed.subtopic);
  }

  const matchedKey = parsed.stream ? `${parsed.stream} / ${parsed.topic}` : parsed.topic;
  const matched = entries.find((entryRow) => topicKey(entryRow) === matchedKey);
  if (!matched) {
    return;
  }

  terms.add(matched.topic);
  if (matched.stream) {
    terms.add(matched.stream);
  }

  if (includeSiblingSubtopics) {
    addTermsFromTopicRow(terms, matched);
    return;
  }

  if (parsed.subtopic) {
    terms.add(parsed.subtopic);
  }
}

/**
 * Collect curriculum terms for speech vocabulary from assignment focus and optional topic keys.
 * @param {{ yearLevel?: string, subject?: string, focus?: string, selectedTopicKeys?: string[]|null, selectedSubtopics?: string[]|null }} params
 * @returns {string[]}
 */
export function getSubtopicTermsForAssignment({
  yearLevel,
  subject,
  focus,
  selectedTopicKeys = null,
  selectedSubtopics = null,
}) {
  const terms = new Set();
  const entries = getTopicEntries(yearLevel, subject);
  const topicKeys = Array.isArray(selectedTopicKeys) ? selectedTopicKeys.filter(Boolean) : [];
  const subtopicLabels = Array.isArray(selectedSubtopics) ? selectedSubtopics.filter(Boolean) : [];

  if (subtopicLabels.length) {
    for (const label of subtopicLabels) {
      addTermsFromFocusLabel(terms, entries, label, { includeSiblingSubtopics: false });
    }
  } else if (topicKeys.length) {
    for (const key of topicKeys) {
      const row = entries.find((entryRow) => topicKey(entryRow) === key);
      addTermsFromTopicRow(terms, row);
    }
    addTermsFromFocusLabel(terms, entries, focus, { includeSiblingSubtopics: true });
  } else {
    addTermsFromFocusLabel(terms, entries, focus, { includeSiblingSubtopics: true });
  }

  return [...terms].filter(Boolean);
}

/**
 * Short label for mic vocabulary hint from assignment topic selection.
 */
export function formatMicVocabHint({
  subject = "",
  selectedSubtopics = [],
  selectedTopicKeys = [],
  focus = "",
} = {}) {
  const subtopics = (selectedSubtopics || []).map(String).filter(Boolean);
  const topicKeys = (selectedTopicKeys || []).map(String).filter(Boolean);

  if (subtopics.length > 1) {
    const names = subtopics.map((label) => parseFocusLabel(label).subtopic || label);
    if (names.length <= 3) {
      return `Mic uses vocabulary for ${names.length} subtopics: ${names.join("; ")}`;
    }
    return `Mic uses vocabulary for ${names.length} subtopics: ${names.slice(0, 3).join("; ")} and ${names.length - 3} more`;
  }

  if (topicKeys.length > 1) {
    const names = topicKeys.map((key) => (key.includes(" / ") ? key.split(" / ").pop() : key));
    if (names.length <= 3) {
      return `Mic uses vocabulary for ${names.length} topics: ${names.join("; ")}`;
    }
    return `Mic uses vocabulary for ${names.length} topics: ${names.slice(0, 3).join("; ")} and ${names.length - 3} more`;
  }

  const parsed = parseFocusLabel(subtopics[0] || focus);
  const label = parsed.subtopic || parsed.topic || focus || "this topic";
  return subject ? `Mic uses vocabulary for ${subject} · ${label}` : "Speak your question";
}

export function getFlatFocusLabels(yearLevel, subject) {
  return getTopicEntries(yearLevel, subject).flatMap((row) =>
    row.subtopics.map((subtopic) => formatFocusLabel(row, subtopic)),
  );
}

/** Subtopic picker rows for Quiz Creator — only topics in selectedTopicKeys. */
export function buildSubtopicOptions(topicOptions, selectedTopicKeys) {
  const items = [];
  for (const topic of topicOptions) {
    if (!selectedTopicKeys.includes(topic.key)) {
      continue;
    }
    for (const subtopic of topic.subtopics || []) {
      items.push({
        topicKey: topic.key,
        subtopic,
        label: formatFocusLabel(
          { topic: topic.topic, stream: topic.stream, subtopics: topic.subtopics },
          subtopic,
        ),
      });
    }
  }
  return items;
}

export function buildCurriculumPromptContext({ yearLevel, subject, focus }) {
  const parsed = parseFocusLabel(focus);
  const entries = getTopicEntries(yearLevel, subject);
  const matched =
    entries.find((row) => topicKey(row) === (parsed.stream ? `${parsed.stream} / ${parsed.topic}` : parsed.topic)) ||
    null;

  const siblingSubtopics = matched?.subtopics || [];
  const acaraRef = matched?.source || null;

  const lines = [
    `Year level: ${yearLevel}`,
    `Subject: ${subject}`,
    parsed.stream ? `VCE stream: ${parsed.stream}` : null,
    `Topic: ${parsed.topic || focus}`,
    parsed.subtopic ? `Subtopic focus: ${parsed.subtopic}` : null,
    acaraRef ? `Curriculum reference: ${acaraRef}` : null,
    siblingSubtopics.length
      ? `Related subtopics in this topic: ${siblingSubtopics.join("; ")}`
      : null,
  ].filter(Boolean);

  return lines.join("\n");
}

export function getCurriculumPickerTree() {
  const tree = {};
  for (const [yearLevel, subjects] of Object.entries(CURRICULUM_HIERARCHY)) {
    tree[yearLevel] = {};
    for (const [subject, entries] of Object.entries(subjects)) {
      tree[yearLevel][subject] = entries.map((row) => ({
        key: topicKey(row),
        topic: row.topic,
        stream: row.stream,
        source: row.source,
        subtopics: [...row.subtopics],
      }));
    }
  }
  return tree;
}
