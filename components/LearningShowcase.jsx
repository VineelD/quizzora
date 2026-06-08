const scenes = [
  {
    src: "/images/learning-classroom.webp",
    title: "Collaborative classrooms",
    copy: "Students work through curriculum-aligned quizzes together, with every submission tracked in one place.",
    alt: "Diverse students collaborating in a bright Australian classroom",
  },
  {
    src: "/images/learning-quiz.webp",
    title: "Focused student portal",
    copy: "A calm, distraction-free workspace where learners complete assignments and see their progress clearly.",
    alt: "Student focused on completing an online quiz on a laptop",
  },
  {
    src: "/images/learning-teacher.webp",
    title: "Teachers stay in control",
    copy: "Educators assign work, monitor completion, and review marks from a single Australian curriculum dashboard.",
    alt: "Teacher reviewing student progress on a tablet in class",
  },
];

export default function LearningShowcase() {
  return (
    <section className="learning-showcase" aria-label="Students learning with Quizzora">
      <div className="learning-showcase-intro">
        <p className="eyebrow">Learning in action</p>
        <h2>Built for real Australian classrooms</h2>
        <p className="hero-copy">
          Quizzora connects teachers and students with structured assessments, clear feedback, and progress you can
          share with families.
        </p>
      </div>

      <div className="learning-showcase-grid">
        {scenes.map((scene) => (
          <article key={scene.src} className="learning-card">
            <div className="learning-card-frame">
              <img className="learning-card-image" src={scene.src} alt={scene.alt} width="640" height="420" loading="lazy" />
            </div>
            <div className="learning-card-body">
              <h3>{scene.title}</h3>
              <p className="muted">{scene.copy}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
